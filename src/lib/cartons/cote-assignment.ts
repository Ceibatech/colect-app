import "server-only";
import { Prisma } from "@prisma/client";
import {
  CLASSEMENT_ACD,
  SIGLE_INCONNU,
  cotePrefixe,
  formatCartonCote,
  formatDossierCote,
  majorityCommune,
  proposeSigle,
} from "@/lib/cartons/cote";

type Tx = Prisma.TransactionClient;

/** Sigle stable de la commune ; attribué à la première utilisation, sans doublon. */
export async function ensureCommuneSigle(tx: Tx, communeId: number | null): Promise<string> {
  if (!communeId) return SIGLE_INCONNU;
  const commune = await tx.commune.findUnique({ where: { id: communeId }, select: { nom: true, sigle: true } });
  if (!commune) return SIGLE_INCONNU;
  if (commune.sigle) return commune.sigle;
  const base = proposeSigle(commune.nom);
  for (let attempt = 0; attempt < 27; attempt++) {
    // En cas de doublon : 2 premières lettres + une lettre libre (KOA, KOB…), jamais de chiffre.
    const sigle = attempt === 0 ? base : `${base.slice(0, 2)}${String.fromCharCode(64 + attempt)}`;
    const taken = await tx.commune.findFirst({ where: { sigle, id: { not: communeId } }, select: { id: true } });
    if (taken) continue;
    await tx.commune.update({ where: { id: communeId }, data: { sigle } });
    return sigle;
  }
  return SIGLE_INCONNU;
}

/** Cote du carton : attribuée une fois (commune majoritaire de ses dossiers), puis stable. */
export async function ensureCartonCote(tx: Tx, cartonId: number, classement: string = CLASSEMENT_ACD): Promise<string> {
  const carton = await tx.carton.findUnique({ where: { id: cartonId }, select: { cote: true } });
  if (carton?.cote) return carton.cote;
  const dossiers = await tx.dossier.findMany({ where: { cartonId }, select: { communeId: true } });
  const sigle = await ensureCommuneSigle(tx, majorityCommune(dossiers.map((d) => d.communeId)));
  const prefixe = cotePrefixe(sigle, /^\d{4}$/.test(classement) ? classement : CLASSEMENT_ACD);
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await tx.carton.aggregate({ where: { cotePrefixe: prefixe }, _max: { coteSequence: true } });
    const sequence = (last._max.coteSequence ?? 0) + 1;
    const cote = formatCartonCote(prefixe, sequence);
    try {
      await tx.carton.update({ where: { id: cartonId }, data: { cote, cotePrefixe: prefixe, coteSequence: sequence } });
      return cote;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  throw new Error("Impossible d'attribuer la cote du carton. Réessayez.");
}

/**
 * Rang et cote du dossier dans son carton. Un dossier ajouté à un carton de
 * n dossiers reçoit le rang n+1 ; un dossier qui change de carton reçoit le
 * rang suivant du nouveau carton. Hors carton : ni rang ni cote.
 * À appeler dans la transaction qui écrit le dossier (ligne carton verrouillée).
 */
export async function assignDossierCote(tx: Tx, dossierId: number, classement?: string) {
  const dossier = await tx.dossier.findUnique({ where: { id: dossierId }, select: { cartonId: true, rangCarton: true, cote: true } });
  if (!dossier) return null;
  if (!dossier.cartonId) {
    if (dossier.rangCarton != null || dossier.cote) await tx.dossier.update({ where: { id: dossierId }, data: { rangCarton: null, cote: null } });
    return null;
  }
  const cartonCote = await ensureCartonCote(tx, dossier.cartonId, classement);
  if (dossier.rangCarton != null && dossier.cote?.startsWith(`${cartonCote}-`)) return dossier.cote;
  const last = await tx.dossier.aggregate({ where: { cartonId: dossier.cartonId, id: { not: dossierId } }, _max: { rangCarton: true } });
  const rang = (last._max.rangCarton ?? 0) + 1;
  const cote = formatDossierCote(cartonCote, rang);
  await tx.dossier.update({ where: { id: dossierId }, data: { rangCarton: rang, cote } });
  return cote;
}

/** Carton désigné par sa cote (ou son ancien CTN). */
export async function findCartonByCote(tx: Tx | Prisma.DefaultPrismaClient, value: string) {
  const text = value.trim().toUpperCase();
  const ctn = /^CTN-(\d{1,10})$/.exec(text);
  return tx.carton.findFirst({
    where: ctn ? { id: Number(ctn[1]) } : { cote: text.split("-").slice(0, 3).join("-") },
    select: { id: true, cote: true },
  });
}

/** Numérote d'un coup, dans l'ordre de saisie, les dossiers du carton qui n'ont pas encore de rang (import). */
export async function assignMissingCotes(tx: Tx, cartonId: number) {
  const cartonCote = await ensureCartonCote(tx, cartonId);
  const [last, pending] = await Promise.all([
    tx.dossier.aggregate({ where: { cartonId, rangCarton: { not: null } }, _max: { rangCarton: true } }),
    tx.dossier.findMany({ where: { cartonId, rangCarton: null }, orderBy: { id: "asc" }, select: { id: true } }),
  ]);
  let rang = last._max.rangCarton ?? 0;
  for (const dossier of pending) {
    rang += 1;
    await tx.dossier.update({ where: { id: dossier.id }, data: { rangCarton: rang, cote: formatDossierCote(cartonCote, rang) } });
  }
  return pending.length;
}
