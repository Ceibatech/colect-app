import "server-only";
import { Prisma } from "@prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { findCartonByCote } from "@/lib/cartons/cote-assignment";
import { coteFromScan, cartonIdFromScan } from "@/lib/cartons/scan";
import { CAPACITE_PAR_DEFAUT, normaliserNumero, refusRangement } from "@/lib/caisses/rules";
import { prisma } from "@/lib/prisma/client";
import { ApiError } from "@/lib/utils/api-error";
import { getClientIp } from "@/lib/utils/server-request";

/**
 * Caisses de rangement du site CEIBA : après traitement, chaque carton est
 * rangé dans une caisse (40 cartons au plus). La caisse ne change ni la cote du
 * carton ni celle de ses dossiers ; seul le lien carton → caisse est tenu, avec
 * son historique.
 */

const COTE_ORDER: Prisma.CartonOrderByWithRelationInput[] = [{ cotePrefixe: "asc" }, { coteSequence: "asc" }, { id: "asc" }];

export async function listCaisses() {
  const caisses = await prisma.caisse.findMany({
    orderBy: [{ isActive: "desc" }, { numero: "asc" }],
    include: { site: { select: { nom: true } }, _count: { select: { cartons: true } } },
  });
  const dossiers = await prisma.dossier.groupBy({
    by: ["cartonId"],
    where: { carton: { caisseId: { in: caisses.map((c) => c.id) } } },
    _count: { _all: true },
  });
  const cartonCaisse = new Map((await prisma.carton.findMany({ where: { caisseId: { not: null } }, select: { id: true, caisseId: true } })).map((c) => [c.id, c.caisseId]));
  const dossiersParCaisse = new Map<number, number>();
  for (const row of dossiers) {
    const caisseId = row.cartonId ? cartonCaisse.get(row.cartonId) : null;
    if (caisseId) dossiersParCaisse.set(caisseId, (dossiersParCaisse.get(caisseId) ?? 0) + row._count._all);
  }
  return caisses.map((caisse) => ({ ...caisse, cartons: caisse._count.cartons, dossiers: dossiersParCaisse.get(caisse.id) ?? 0 }));
}

export async function getCaisse(id: number) {
  const caisse = await prisma.caisse.findUnique({
    where: { id },
    include: {
      site: { select: { id: true, nom: true } },
      cartons: {
        orderBy: COTE_ORDER,
        select: {
          id: true, cote: true, misEnCaisseAt: true,
          dossiers: { select: { libelleCarton: true }, take: 1, orderBy: { id: "asc" } },
          _count: { select: { dossiers: true } },
        },
      },
      mouvements: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, type: true, createdAt: true, user: { select: { name: true } }, carton: { select: { id: true, cote: true } } },
      },
    },
  });
  if (!caisse) return null;
  return {
    ...caisse,
    cartons: caisse.cartons.map((carton) => ({
      id: carton.id,
      cote: carton.cote ?? `CTN-${String(carton.id).padStart(8, "0")}`,
      libelle: carton.dossiers[0]?.libelleCarton ?? null,
      dossiers: carton._count.dossiers,
      misEnCaisseAt: carton.misEnCaisseAt,
    })),
  };
}

export async function listCeibaSites() {
  return prisma.site.findMany({ where: { organisation: "CEIBA", isActive: true }, orderBy: { nom: "asc" }, select: { id: true, nom: true } });
}

type CaisseInput = { numero: string; description?: string | null; capacite?: number; siteId: number; isActive?: boolean };

async function checkInput(input: CaisseInput, id?: number) {
  const numero = normaliserNumero(input.numero);
  if (!numero) throw new ApiError("Numéro de caisse invalide : lettres, chiffres, espaces, - / . (40 caractères au plus).", 400);
  const capacite = input.capacite ?? CAPACITE_PAR_DEFAUT;
  if (!Number.isInteger(capacite) || capacite < 1 || capacite > 500) throw new ApiError("Capacité invalide (1 à 500 cartons).", 400);
  const site = await prisma.site.findUnique({ where: { id: input.siteId }, select: { organisation: true } });
  if (site?.organisation !== "CEIBA") throw new ApiError("Une caisse appartient à un site CEIBA.", 400);
  const taken = await prisma.caisse.findFirst({ where: { numero, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (taken) throw new ApiError(`Le numéro ${numero} est déjà utilisé par une autre caisse.`, 409);
  return { numero, capacite, siteId: input.siteId, description: input.description?.trim() || null };
}

export async function createCaisse(input: CaisseInput) {
  const session = await requireApiPermission("REFERENTIEL_MANAGE");
  const data = await checkInput(input);
  const caisse = await prisma.caisse.create({ data });
  await prisma.auditLog.create({ data: { userId: session.userId, action: "CAISSE_CREATE", entity: "CAISSE", entityId: caisse.id, newValue: data, ipAddress: await getClientIp() } });
  return caisse;
}

/** Renuméroter ou modifier une caisse : son contenu et son historique restent attachés. */
export async function updateCaisse(id: number, input: CaisseInput) {
  const session = await requireApiPermission("REFERENTIEL_MANAGE");
  const current = await prisma.caisse.findUnique({ where: { id }, include: { _count: { select: { cartons: true } } } });
  if (!current) throw new ApiError("Caisse introuvable.", 404);
  const data = await checkInput(input, id);
  if (data.capacite < current._count.cartons) throw new ApiError(`La caisse contient déjà ${current._count.cartons} cartons : capacité trop faible.`, 400);
  if (data.siteId !== current.siteId && current._count.cartons) throw new ApiError("Videz la caisse avant de la rattacher à un autre site.", 400);
  if (input.isActive === false && current._count.cartons) throw new ApiError("Videz la caisse avant de la retirer du service.", 400);
  const caisse = await prisma.caisse.update({ where: { id }, data: { ...data, isActive: input.isActive ?? current.isActive } });
  await prisma.auditLog.create({
    data: { userId: session.userId, action: "CAISSE_UPDATE", entity: "CAISSE", entityId: id, oldValue: { numero: current.numero, capacite: current.capacite, siteId: current.siteId }, newValue: data, ipAddress: await getClientIp() },
  });
  return caisse;
}

/** Range un carton (cote, QR ou CTN) dans la caisse. La caisse est verrouillée : deux agents ne la dépassent pas. */
export async function rangerCarton(caisseId: number, scan: string) {
  const session = await requireApiPermission("CONDITIONNEMENT_UPDATE");
  const ref = coteFromScan(scan) ?? (cartonIdFromScan(scan) ? `CTN-${String(cartonIdFromScan(scan)).padStart(8, "0")}` : scan.trim());
  const found = await findCartonByCote(prisma, ref);
  if (!found) throw new ApiError(`Aucun carton ne porte la cote « ${scan.trim()} ».`, 404);
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT id FROM caisses WHERE id = ${caisseId} FOR UPDATE`);
    if (!locked) throw new ApiError("Caisse introuvable.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM cartons WHERE id = ${found.id} FOR UPDATE`);
    const [caisse, carton, occupes] = await Promise.all([
      tx.caisse.findUniqueOrThrow({ where: { id: caisseId }, select: { id: true, numero: true, siteId: true, capacite: true, isActive: true } }),
      tx.carton.findUniqueOrThrow({
        where: { id: found.id },
        select: { id: true, cote: true, caisseId: true, caisse: { select: { numero: true } }, dossiers: { select: { siteId: true, statutConditionnement: true } } },
      }),
      tx.carton.count({ where: { caisseId } }),
    ]);
    if (!caisse.isActive) throw new ApiError("Cette caisse est retirée du service.", 400);
    const refus = refusRangement(carton, { ...caisse, occupes }, carton.caisse?.numero);
    if (refus) throw new ApiError(refus, 409);
    if (carton.caisseId === caisseId) return { cote: carton.cote, dejaRange: true, occupes, capacite: caisse.capacite };
    await tx.carton.update({ where: { id: carton.id }, data: { caisseId, misEnCaisseAt: new Date() } });
    await tx.caisseMouvement.create({ data: { caisseId, cartonId: carton.id, type: "RANGEMENT", userId: session.userId } });
    return { cote: carton.cote, dejaRange: false, occupes: occupes + 1, capacite: caisse.capacite };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 30_000 });
}

export async function retirerCarton(caisseId: number, cartonId: number) {
  const session = await requireApiPermission("CONDITIONNEMENT_UPDATE");
  return prisma.$transaction(async (tx) => {
    const moved = await tx.carton.updateMany({ where: { id: cartonId, caisseId }, data: { caisseId: null, misEnCaisseAt: null } });
    if (!moved.count) throw new ApiError("Ce carton n'est pas dans cette caisse.", 404);
    await tx.caisseMouvement.create({ data: { caisseId, cartonId, type: "RETRAIT", userId: session.userId } });
    return { ok: true };
  });
}
