// Suppression de cartons de test et de leurs dossiers, désignés par leur cote.
//
//   node deploy/supprimer-donnees-test.mjs --cartons=2010-ABS-0001,2010-ADZ-0001
//       → simulation, rien n'est modifié
//   node deploy/supprimer-donnees-test.mjs --cartons=… --apply --confirm=SUPPRIMER-DONNEES-TEST
//
// Pour chaque carton, dans une seule transaction et dans cet ordre :
//   1. pour chaque dossier : historique, transitions de workflow, numérisations,
//      types de pièces associés, puis le dossier ;
//   2. le carton ;
//   3. une ligne d'audit TEST_DATA_DELETE (cotes et références, sans nom).
//
// Refus (rien n'est supprimé) si un carton est introuvable ou si l'un de ses
// dossiers est lié à autre chose que ce circuit : documents, indexation,
// archivage, contrôle qualité, anomalies, lignes de préparation,
// reconditionnement, lot de transfert, conteneur.
// Le script de déploiement fait une sauvegarde de la base avant --apply.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const CONFIRMATION = "SUPPRIMER-DONNEES-TEST";
const COTE = /^[A-Z0-9][A-Z0-9-]{4,38}[A-Z0-9]$/;

/** « 2010-ABS-0001, 2010-adz-0001 » → ["2010-ABS-0001", "2010-ADZ-0001"] ; refuse une cote mal formée ou en double. */
export function parseCartons(value) {
  const cotes = String(value ?? "").split(",").map((part) => part.trim().toUpperCase()).filter(Boolean);
  if (!cotes.length) throw new Error("--cartons est obligatoire (cotes séparées par des virgules).");
  for (const cote of cotes) if (!COTE.test(cote)) throw new Error(`Cote invalide : ${cote}`);
  if (new Set(cotes).size !== cotes.length) throw new Error("Une cote est indiquée deux fois.");
  return cotes;
}

const BLOCKING = {
  documents: "documents",
  indexations: "indexations",
  archivages: "archivages",
  qualityChecks: "contrôles qualité",
  anomalies: "anomalies",
  preparationLines: "lignes de préparation",
  reconditionnement: "sessions de reconditionnement",
  lotDossiers: "lots de transfert",
  lotItems: "cartons engagés dans un lot",
  caisse: "conteneur",
};

/** Liens qui interdisent la suppression : { documents: 2, caisse: 1 } → ["2 documents", "1 conteneur"]. */
export function blockers(links) {
  return Object.keys(BLOCKING).filter((key) => (links[key] ?? 0) > 0).map((key) => `${links[key]} ${BLOCKING[key]}`);
}

async function load(db, cotes) {
  const items = [];
  for (const cote of cotes) {
    const carton = await db.carton.findUnique({ where: { cote }, select: { id: true, cote: true, caisseId: true } });
    if (!carton) throw new Error(`Carton introuvable : ${cote}`);
    const dossiers = await db.dossier.findMany({ where: { cartonId: carton.id }, select: { id: true, reference: true, cote: true } });
    const ids = dossiers.map((dossier) => dossier.id);
    const [history, workflow, numerisations] = await Promise.all([
      db.dossierHistory.count({ where: { dossierId: { in: ids } } }),
      db.workflowTransition.count({ where: { dossierId: { in: ids } } }),
      db.numerisation.count({ where: { dossierId: { in: ids } } }),
    ]);
    const links = {
      documents: await db.document.count({ where: { dossierId: { in: ids } } }),
      indexations: await db.indexation.count({ where: { dossierId: { in: ids } } }),
      archivages: await db.archivage.count({ where: { dossierId: { in: ids } } }),
      qualityChecks: await db.qualityCheck.count({ where: { dossierId: { in: ids } } }),
      anomalies: await db.anomalie.count({ where: { dossierId: { in: ids } } }),
      preparationLines: await db.preparationPieceLine.count({ where: { dossierId: { in: ids } } }),
      reconditionnement: await db.reconditionnementSession.count({ where: { dossierId: { in: ids } } }),
      lotDossiers: await db.transferLotDossier.count({ where: { dossierId: { in: ids } } }),
      lotItems: await db.transferLotItem.count({ where: { cartonCode: cote } }),
      caisse: carton.caisseId ? 1 : 0,
    };
    items.push({ carton, dossiers, history, workflow, numerisations, links, blocked: blockers(links) });
  }
  return items;
}

export async function supprimerDonneesTest(prisma, cotes, { apply = false } = {}) {
  const before = await load(prisma, cotes);
  const blocked = before.filter((item) => item.blocked.length);
  if (blocked.length) {
    throw new Error(blocked.map((item) => `${item.carton.cote} : ${item.blocked.join(", ")}`).join(" ; ") + ". Suppression refusée.");
  }
  if (!apply) return { applied: false, before };

  await prisma.$transaction(async (tx) => {
    for (const item of before) {
      for (const dossier of item.dossiers) {
        await tx.dossierHistory.deleteMany({ where: { dossierId: dossier.id } });
        await tx.workflowTransition.deleteMany({ where: { dossierId: dossier.id } });
        await tx.numerisation.deleteMany({ where: { dossierId: dossier.id } });
        await tx.dossier.update({ where: { id: dossier.id }, data: { typesPieces: { set: [] } } });
        await tx.dossier.delete({ where: { id: dossier.id } });
      }
      await tx.carton.delete({ where: { id: item.carton.id } });
    }
    await tx.auditLog.create({
      data: {
        action: "TEST_DATA_DELETE",
        entity: "CARTON",
        oldValue: before.map((item) => ({ carton: item.carton.cote, dossiers: item.dossiers.map((dossier) => ({ reference: dossier.reference, cote: dossier.cote })) })),
        newValue: { reason: "Suppression de données de test" },
      },
    });
  }, { maxWait: 10_000, timeout: 60_000 });

  const remaining = await Promise.all(cotes.map((cote) => prisma.carton.count({ where: { cote } })));
  return { applied: true, before, remaining: remaining.reduce((sum, count) => sum + count, 0) };
}

function report(items, title) {
  console.log(title);
  for (const item of items) {
    console.log(`  Carton ${item.carton.cote} (id ${item.carton.id})`);
    for (const dossier of item.dossiers) console.log(`    Dossier ${dossier.reference}  ${dossier.cote ?? "(sans cote)"}  (id ${dossier.id})`);
    console.log(`    Historique : ${item.history} · transitions : ${item.workflow} · numérisations : ${item.numerisations}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const cartonsArg = args.find((arg) => arg.startsWith("--cartons="));
  const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm=") && !arg.startsWith("--cartons="));
  const prisma = new PrismaClient();
  try {
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const cotes = parseCartons(cartonsArg?.slice("--cartons=".length));
    const result = await supprimerDonneesTest(prisma, cotes, { apply });
    report(result.before, apply ? "Supprimé :" : "SIMULATION — aucune donnée modifiée. Serait supprimé :");
    if (result.applied) console.log(`\nSuppression appliquée. Cartons restants parmi ceux indiqués : ${result.remaining}.`);
  } catch (error) {
    console.error(`Suppression des données de test échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
