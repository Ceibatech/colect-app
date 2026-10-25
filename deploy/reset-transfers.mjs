// Réinitialisation complète du circuit de transfert (données de test).
//
//   node deploy/reset-transfers.mjs                       → simulation, rien n'est modifié
//   node deploy/reset-transfers.mjs --apply --confirm=REINITIALISER-TRANSFERTS
//
// Effets en mode --apply, dans une seule transaction :
//   1. chaque dossier déjà sorti revient à l'emplacement (site + salle) d'où
//      il est parti lors de sa première sortie, qu'il soit en transit, reçu
//      ou retourné ; les dossiers jamais sortis n'ont pas bougé ;
//   2. suppression des lots, cartons engagés, mouvements (bordereaux),
//      signatures, points GPS et e-mails de transfert ;
//   3. suppression de l'historique dossier TRANSFER_SORTIE/RECEPTION/RETOUR ;
//   4. suppression des cartons devenus vides et sans historique ;
//   5. une ligne d'audit TRANSFER_RESET ;
// puis, hors transaction, remise à 1 des compteurs (LOT-AAAA-000001, BTR-…).
//
// Les journaux d'audit des anciennes opérations sont conservés.
// Le script de déploiement fait une sauvegarde de la base avant --apply.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const CONFIRMATION = "REINITIALISER-TRANSFERTS";

const TRANSFER_TABLES = [
  "transfer_movement_items",
  "transfer_signatures",
  "transfer_movements",
  "transfer_tracking_points",
  "transfer_lot_dossiers",
  "transfer_lot_items",
  "transfer_lots",
];
const HISTORY_ACTIONS = ["TRANSFER_SORTIE", "TRANSFER_RECEPTION", "TRANSFER_RETOUR"];
const EMAIL_ENTITIES = ["TRANSFER_LOT", "TRANSFER_MOVEMENT", "TRANSFER_OPERATION"];

// Emplacement d'origine : source du lot de la PREMIÈRE sortie effective du
// dossier. La sortie exige que le dossier soit exactement à cet emplacement
// (site + salle) ; un dossier jamais sorti n'a pas bougé et n'est pas touché.
const ORIGIN_SQL = `
  SELECT dossier_id, source_site_id, source_entrepot_id FROM (
    SELECT tld.dossier_id, tl.source_site_id, tl.source_entrepot_id,
      ROW_NUMBER() OVER (PARTITION BY tld.dossier_id ORDER BY tm.occurred_at, tm.id) AS rn
    FROM transfer_movements tm
    JOIN transfer_movement_items tmi ON tmi.movement_id = tm.id
    JOIN transfer_lot_dossiers tld ON tld.transfer_lot_item_id = tmi.transfer_lot_item_id
    JOIN transfer_lots tl ON tl.id = tm.transfer_lot_id
    WHERE tm.type = 'SORTIE'
  ) ranked WHERE rn = 1`;

const n = (value) => Number(value ?? 0);
const list = (values) => values.map((value) => `'${value}'`).join(", ");

async function inspect(db) {
  const counts = {};
  for (const table of TRANSFER_TABLES) {
    const [row] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${table}`);
    counts[table] = n(row.c);
  }
  const [emails] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM transfer_email_deliveries WHERE entity_type IN (${list(EMAIL_ENTITIES)})`);
  const [history] = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM dossier_history WHERE action IN (${list(HISTORY_ACTIONS)})`);
  const lotsByStatus = await db.$queryRawUnsafe(`SELECT status, COUNT(*) AS c FROM transfer_lots GROUP BY status ORDER BY status`);
  const [moves] = await db.$queryRawUnsafe(`
    SELECT COUNT(*) AS total,
      SUM(d.site_id IS NULL) AS in_transit,
      SUM(NOT (d.site_id <=> o.source_site_id AND d.entrepot_id <=> o.source_entrepot_id)) AS to_restore
    FROM (${ORIGIN_SQL}) o JOIN dossiers d ON d.id = o.dossier_id`);
  const [attached] = await db.$queryRawUnsafe(`
    SELECT COALESCE(SUM(CAST(JSON_VALUE(new_value, '$.attachedToSourceCount') AS UNSIGNED)), 0) AS c
    FROM audit_logs WHERE action = 'TRANSFER_LOT_CREATE'`);
  return {
    counts,
    emails: n(emails.c),
    history: n(history.c),
    lotsByStatus: lotsByStatus.map((row) => ({ status: row.status, count: n(row.c) })),
    dossiers: { total: n(moves.total), inTransit: n(moves.in_transit), toRestore: n(moves.to_restore) },
    attachedFromHistoricalStock: n(attached.c),
  };
}

function printReport(report, heading, { notes = true } = {}) {
  console.log(heading);
  console.log(`  Lots : ${report.counts.transfer_lots}${report.lotsByStatus.length ? ` (${report.lotsByStatus.map((s) => `${s.status} ${s.count}`).join(", ")})` : ""}`);
  console.log(`  Cartons engagés : ${report.counts.transfer_lot_items} — liens dossier : ${report.counts.transfer_lot_dossiers}`);
  console.log(`  Bordereaux : ${report.counts.transfer_movements} — signatures : ${report.counts.transfer_signatures} — points GPS : ${report.counts.transfer_tracking_points}`);
  console.log(`  E-mails de transfert : ${report.emails} — historique dossier transfert : ${report.history}`);
  console.log(`  Dossiers déjà sortis : ${report.dossiers.total} — en transit : ${report.dossiers.inTransit} — à remettre à l'origine : ${report.dossiers.toRestore}`);
  if (notes && report.attachedFromHistoricalStock > 0) {
    console.log(`  Note : ${report.attachedFromHistoricalStock} dossier(s) du stock historique sans emplacement avaient été rattachés au site source à la création d'un lot ; ils restent sur ce site.`);
  }
}

export async function resetTransfers(prisma, { apply = false } = {}) {
  const before = await inspect(prisma);
  if (!apply) return { applied: false, before };

  const restored = await prisma.$transaction(async (tx) => {
    // Verrouille les lots pour qu'aucune action de transfert ne s'intercale.
    await tx.$queryRawUnsafe("SELECT id FROM transfer_lots FOR UPDATE");
    const updated = await tx.$executeRawUnsafe(`
      UPDATE dossiers d JOIN (${ORIGIN_SQL}) o ON o.dossier_id = d.id
      SET d.site_id = o.source_site_id, d.entrepot_id = o.source_entrepot_id
      WHERE NOT (d.site_id <=> o.source_site_id AND d.entrepot_id <=> o.source_entrepot_id)`);
    await tx.$executeRawUnsafe(`DELETE FROM dossier_history WHERE action IN (${list(HISTORY_ACTIONS)})`);
    await tx.$executeRawUnsafe(`DELETE FROM transfer_email_deliveries WHERE entity_type IN (${list(EMAIL_ENTITIES)})`);
    for (const table of TRANSFER_TABLES) await tx.$executeRawUnsafe(`DELETE FROM ${table}`);
    await tx.$executeRawUnsafe(`
      DELETE c FROM cartons c
      LEFT JOIN dossiers d ON d.carton_id = c.id
      WHERE d.id IS NULL`);
    await tx.auditLog.create({
      data: {
        action: "TRANSFER_RESET",
        entity: "TRANSFER_LOT",
        oldValue: before,
        newValue: { restoredDossiers: updated, reason: "Réinitialisation des transferts de test" },
      },
    });
    return updated;
  }, { maxWait: 10_000, timeout: 120_000 });

  // ALTER TABLE valide implicitement : uniquement après le commit, tables vides.
  for (const table of TRANSFER_TABLES) await prisma.$executeRawUnsafe(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
  const after = await inspect(prisma);
  return { applied: true, before, after, restored };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm="));
  const prisma = new PrismaClient();
  try {
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) {
      throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    }
    const result = await resetTransfers(prisma, { apply });
    printReport(result.before, apply ? "État avant réinitialisation :" : "SIMULATION — aucune donnée modifiée. Serait supprimé / restauré :");
    if (result.applied) {
      console.log(`\nRéinitialisation appliquée : ${result.restored} dossier(s) remis à leur emplacement d'origine.`);
      printReport(result.after, "État après réinitialisation :", { notes: false });
    }
  } catch (error) {
    console.error(`Réinitialisation des transferts échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
