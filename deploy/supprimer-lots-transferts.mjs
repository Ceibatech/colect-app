// Suppression de lots de transfert désignés par leur référence, sans toucher aux autres.
//
//   node deploy/supprimer-lots-transferts.mjs --lots=LOT-2026-000001,LOT-2026-000002
//       → simulation, rien n'est modifié
//   node deploy/supprimer-lots-transferts.mjs --lots=… --apply --confirm=SUPPRIMER-LOTS
//
// Contrairement à reset-transfers.mjs (tous les transferts, et les cartons
// vides), ce script ne supprime QUE les lots indiqués et ce qui en dépend ;
// aucun carton n'est supprimé. En mode --apply, dans une seule transaction :
//   1. chaque dossier déjà sorti dans ces lots revient à l'emplacement (site +
//      salle) d'où il est parti lors de sa première sortie ;
//   2. suppression de l'historique dossier TRANSFER_SORTIE/RECEPTION/RETOUR des
//      dossiers de ces lots, des e-mails de transfert liés, puis dans l'ordre :
//      lignes de bordereaux, signatures, mouvements, points GPS, étapes de
//      convoi, dossiers et cartons engagés, participants, lots ;
//   3. une ligne d'audit TRANSFER_LOTS_DELETE ;
// puis, hors transaction, remise à 1 des compteurs des tables de transfert
// devenues vides (le prochain lot reprend LOT-AAAA-000001 si plus aucun lot ne reste).
//
// Refus (rien n'est supprimé) si une référence est introuvable ou si un
// conteneur est rattaché à l'un des lots. Les journaux d'audit sont conservés.
// Le script de déploiement fait une sauvegarde de la base avant --apply.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

export const CONFIRMATION = "SUPPRIMER-LOTS";
const LOT = /^LOT-\d{4}-\d{6}$/;
const HISTORY_ACTIONS = ["TRANSFER_SORTIE", "TRANSFER_RECEPTION", "TRANSFER_RETOUR"];
const COUNTER_TABLES = [
  "transfer_movement_items", "transfer_signatures", "transfer_movements", "transfer_tracking_points", "transfer_convoy_events",
  "transfer_lot_dossiers", "transfer_lot_items", "transfer_lot_participants", "transfer_lots",
];

/** « LOT-2026-000001, lot-2026-000002 » → ["LOT-2026-000001", "LOT-2026-000002"] ; refuse une référence mal formée ou en double. */
export function parseLots(value) {
  const references = String(value ?? "").split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
  if (!references.length) throw new Error("--lots est obligatoire (références séparées par des virgules).");
  for (const reference of references) if (!LOT.test(reference)) throw new Error(`Référence de lot invalide : ${reference}`);
  if (new Set(references).size !== references.length) throw new Error("Une référence est indiquée deux fois.");
  return references;
}

export function chunk(list, size = 1000) {
  const parts = [];
  for (let i = 0; i < list.length; i += size) parts.push(list.slice(i, i + size));
  return parts;
}

const n = (value) => Number(value ?? 0);

// Emplacement d'origine : source du lot de la PREMIÈRE sortie des dossiers, parmi les lots visés.
const originSql = (lotIds) => Prisma.sql`
  SELECT dossier_id, source_site_id, source_entrepot_id FROM (
    SELECT tld.dossier_id, tl.source_site_id, tl.source_entrepot_id,
      ROW_NUMBER() OVER (PARTITION BY tld.dossier_id ORDER BY tm.occurred_at, tm.id) AS rn
    FROM transfer_movements tm
    JOIN transfer_movement_items tmi ON tmi.movement_id = tm.id
    JOIN transfer_lot_dossiers tld ON tld.transfer_lot_item_id = tmi.transfer_lot_item_id
    JOIN transfer_lots tl ON tl.id = tm.transfer_lot_id
    WHERE tm.type = 'SORTIE' AND tm.transfer_lot_id IN (${Prisma.join(lotIds)})
  ) ranked WHERE rn = 1`;

async function inspect(db, references) {
  const lots = await db.transferLot.findMany({ where: { reference: { in: references } }, select: { id: true, reference: true, status: true } });
  const missing = references.filter((reference) => !lots.some((lot) => lot.reference === reference));
  if (missing.length) throw new Error(`Lot introuvable : ${missing.join(", ")}`);
  const lotIds = lots.map((lot) => lot.id);
  const inLots = { transferLotId: { in: lotIds } };

  const caisses = await db.caisse.count({ where: { transferLotId: { in: lotIds } } });
  if (caisses) throw new Error(`${caisses} conteneur(s) rattaché(s) à ces lots : suppression refusée.`);

  const movements = await db.transferMovement.findMany({ where: inLots, select: { id: true } });
  const convoyEvents = await db.transferConvoyEvent.findMany({ where: inLots, select: { id: true } });
  const dossierRows = await db.transferLotDossier.findMany({ where: { transferLotItem: inLots }, select: { dossierId: true } });
  const dossierIds = [...new Set(dossierRows.map((row) => row.dossierId))];
  const [items, signatures, tracking] = await Promise.all([
    db.transferLotItem.count({ where: inLots }),
    db.transferSignature.count({ where: { movement: inLots } }),
    db.transferTrackingPoint.count({ where: inLots }),
  ]);
  const [toRestore] = await db.$queryRaw(Prisma.sql`
    SELECT COUNT(*) AS total, COALESCE(SUM(NOT (d.site_id <=> o.source_site_id AND d.entrepot_id <=> o.source_entrepot_id)), 0) AS a_restaurer
    FROM (${originSql(lotIds)}) o JOIN dossiers d ON d.id = o.dossier_id`);
  let history = 0;
  for (const part of chunk(dossierIds)) {
    history += await db.dossierHistory.count({ where: { action: { in: HISTORY_ACTIONS }, dossierId: { in: part } } });
  }
  const emails = await db.transferEmailDelivery.count({ where: emailFilter(lotIds, movements, convoyEvents) });
  return {
    lots, lotIds, movements: movements.map((row) => row.id), convoyEvents: convoyEvents.map((row) => row.id), dossierIds,
    counts: { cartons: items, dossiers: dossierIds.length, mouvements: movements.length, signatures, pointsGps: tracking, etapesConvoi: convoyEvents.length, dossiersSortis: n(toRestore?.total), dossiersARestaurer: n(toRestore?.a_restaurer), historique: history, emails },
  };
}

function emailFilter(lotIds, movements, convoyEvents) {
  const or = [{ entityType: "TRANSFER_LOT", entityId: { in: lotIds } }];
  if (movements.length) or.push({ entityType: "TRANSFER_MOVEMENT", entityId: { in: movements.map((row) => row.id) } });
  if (convoyEvents.length) or.push({ entityType: "TRANSFER_CONVOY", entityId: { in: convoyEvents.map((row) => row.id) } });
  return { OR: or };
}

export async function supprimerLots(prisma, references, { apply = false } = {}) {
  const before = await inspect(prisma, references);
  if (!apply) return { applied: false, before };

  const { lotIds, movements, convoyEvents, dossierIds } = before;
  const restored = await prisma.$transaction(async (tx) => {
    // Verrouille les lots pour qu'aucune action de transfert ne s'intercale.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM transfer_lots WHERE id IN (${Prisma.join(lotIds)}) FOR UPDATE`);
    const updated = await tx.$executeRaw(Prisma.sql`
      UPDATE dossiers d JOIN (${originSql(lotIds)}) o ON o.dossier_id = d.id
      SET d.site_id = o.source_site_id, d.entrepot_id = o.source_entrepot_id
      WHERE NOT (d.site_id <=> o.source_site_id AND d.entrepot_id <=> o.source_entrepot_id)`);
    for (const part of chunk(dossierIds)) {
      await tx.dossierHistory.deleteMany({ where: { action: { in: HISTORY_ACTIONS }, dossierId: { in: part } } });
    }
    await tx.transferEmailDelivery.deleteMany({ where: emailFilter(lotIds, movements.map((id) => ({ id })), convoyEvents.map((id) => ({ id }))) });
    const inLots = { transferLotId: { in: lotIds } };
    await tx.transferMovementItem.deleteMany({ where: { movement: inLots } });
    await tx.transferSignature.deleteMany({ where: { movement: inLots } });
    await tx.transferMovement.deleteMany({ where: inLots });
    await tx.transferTrackingPoint.deleteMany({ where: inLots });
    await tx.transferConvoyEvent.deleteMany({ where: inLots });
    await tx.transferLotDossier.deleteMany({ where: { transferLotItem: inLots } });
    await tx.transferLotItem.deleteMany({ where: inLots });
    await tx.transferLotParticipant.deleteMany({ where: inLots });
    await tx.transferLot.deleteMany({ where: { id: { in: lotIds } } });
    await tx.auditLog.create({
      data: {
        action: "TRANSFER_LOTS_DELETE",
        entity: "TRANSFER_LOT",
        oldValue: { lots: before.lots.map((lot) => ({ reference: lot.reference, status: lot.status })), ...before.counts },
        newValue: { restoredDossiers: updated, reason: "Suppression de lots de transfert" },
      },
    });
    return updated;
  }, { maxWait: 10_000, timeout: 120_000 });

  // ALTER TABLE valide implicitement : uniquement après le commit, et seulement pour les tables vides.
  const reset = [];
  for (const table of COUNTER_TABLES) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${table}`);
    if (n(row.c) === 0) {
      await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
      reset.push(table);
    }
  }
  const remaining = await prisma.transferLot.count();
  return { applied: true, before, restored, reset, remaining };
}

function report(before, title) {
  console.log(title);
  for (const lot of before.lots) console.log(`  ${lot.reference}  (${lot.status})`);
  const c = before.counts;
  console.log(`  Cartons engagés : ${c.cartons} · dossiers : ${c.dossiers} · mouvements (bordereaux) : ${c.mouvements} · signatures : ${c.signatures}`);
  console.log(`  Points GPS : ${c.pointsGps} · étapes de convoi : ${c.etapesConvoi} · e-mails de transfert : ${c.emails}`);
  console.log(`  Dossiers déjà sortis : ${c.dossiersSortis}, dont ${c.dossiersARestaurer} à remettre à leur emplacement d'origine · historique de transfert effacé : ${c.historique}`);
  console.log("  Aucun carton n'est supprimé.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const lotsArg = args.find((arg) => arg.startsWith("--lots="));
  const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm=") && !arg.startsWith("--lots="));
  const prisma = new PrismaClient();
  try {
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const references = parseLots(lotsArg?.slice("--lots=".length));
    const result = await supprimerLots(prisma, references, { apply });
    report(result.before, apply ? "Supprimé :" : "SIMULATION — aucune donnée modifiée. Serait supprimé :");
    if (result.applied) {
      console.log(`\nSuppression appliquée : ${result.restored} dossier(s) remis à leur emplacement d'origine. Lots restants : ${result.remaining}.`);
      console.log(`Compteurs remis à 1 : ${result.reset.length ? result.reset.join(", ") : "aucun (des données de transfert subsistent)"}.`);
    }
  } catch (error) {
    console.error(`Suppression des lots échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
