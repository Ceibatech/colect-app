import "server-only";
import { Prisma } from "@prisma/client";
import {
  CLASSEMENT_ACD,
  parseCote,
  SIGLE_INCONNU,
  communeIdentifiant,
  cotePrefixe,
  cotePrefixeNouveau,
  formatCartonCote,
  formatDossierCote,
  majorityCommune,
  proposeSigle,
} from "@/lib/cartons/cote";
import { communeCiParNom, findRubriqueV3, RUBRIQUE_ACD, rubriquePourCommune } from "@/lib/referentiel/codification";

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

/**
 * Identifiant figé (3 chiffres, référentiel RGPH) de la commune. Rattaché à la
 * première utilisation, depuis le code « CI-113 » ou le nom de la commune dans
 * la table maîtresse ; null si la commune n'y figure pas.
 */
export async function ensureCommuneIdentifiant(tx: Tx, communeId: number | null): Promise<string | null> {
  if (!communeId) return null;
  const commune = await tx.commune.findUnique({ where: { id: communeId }, select: { identifiant: true, code: true, nom: true } });
  if (!commune) return null;
  if (commune.identifiant) return commune.identifiant;
  const ci = communeCiParNom(commune.nom);
  const identifiant = communeIdentifiant(commune.code) ?? ci?.identifiant ?? null;
  if (!identifiant) return null;
  const taken = await tx.commune.findFirst({ where: { identifiant, id: { not: communeId } }, select: { id: true } });
  if (taken) return null;
  await tx.commune.update({
    where: { id: communeId },
    data: { identifiant, ...(ci ? { district: ci.district, region: ci.region, departement: ci.departement } : {}) },
  });
  return identifiant;
}

/**
 * Préfixe de la cote d'un nouveau carton : FON-3302-113 (fonction déduite de la
 * rubrique, identifiant de commune). Une commune absente du référentiel garde
 * l'ancien format 2010-XXX, toujours lu, le temps de la rattacher.
 */
export async function cartonCotePrefixe(tx: Tx, communeId: number | null, classement: string = RUBRIQUE_ACD): Promise<{ prefixe: string; ancien: string | null }> {
  const identifiant = await ensureCommuneIdentifiant(tx, communeId);
  const rubrique = findRubriqueV3(classement) ?? findRubriqueV3(RUBRIQUE_ACD)!;
  if (identifiant) {
    const [fonction, numero] = rubriquePourCommune(rubrique.key, identifiant).split("-");
    const prefixe = cotePrefixeNouveau(fonction, numero, identifiant);
    if (prefixe) {
      // Les ACD de l'ancien format (2010-KOU-…) deviennent ceux du nouveau
      // (FON-3302-113-…) en gardant leur numéro : la suite continue après eux.
      const sigle = rubrique.key === RUBRIQUE_ACD && communeId ? (await tx.commune.findUnique({ where: { id: communeId }, select: { sigle: true } }))?.sigle : null;
      return { prefixe, ancien: sigle ? cotePrefixe(sigle, CLASSEMENT_ACD) : null };
    }
  }
  return { prefixe: cotePrefixe(await ensureCommuneSigle(tx, communeId), CLASSEMENT_ACD), ancien: null };
}

/** Cote du carton : attribuée une fois (commune majoritaire de ses dossiers), puis stable. */
export async function ensureCartonCote(tx: Tx, cartonId: number, classement: string = RUBRIQUE_ACD): Promise<string> {
  const carton = await tx.carton.findUnique({ where: { id: cartonId }, select: { cote: true } });
  if (carton?.cote) return carton.cote;
  const dossiers = await tx.dossier.findMany({ where: { cartonId }, select: { communeId: true } });
  const { prefixe, ancien } = await cartonCotePrefixe(tx, majorityCommune(dossiers.map((d) => d.communeId)), classement);
  // Compteur par préfixe : une suite par fonction, rubrique et commune, jamais réutilisée.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await tx.carton.aggregate({ where: { cotePrefixe: { in: ancien ? [prefixe, ancien] : [prefixe] } }, _max: { coteSequence: true } });
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

/** Carton désigné par sa cote, son ancienne cote (2010-KOU-0001, alias) ou son ancien CTN. */
export async function findCartonByCote(tx: Tx | Prisma.DefaultPrismaClient, value: string) {
  const text = value.trim().toUpperCase();
  const ctn = /^CTN-(\d{1,10})$/.exec(text);
  const carton = ctn ? null : parseCote(text)?.carton ?? text;
  return tx.carton.findFirst({
    where: ctn ? { id: Number(ctn[1]) } : { OR: [{ cote: carton }, { coteAncienne: carton }] },
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
