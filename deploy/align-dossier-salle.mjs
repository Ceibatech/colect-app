// Range tous les dossiers d'un site dans une même salle (correction de saisie).
//
//   node deploy/align-dossier-salle.mjs --salle="Tour D mezzanine"                 → simulation
//   node deploy/align-dossier-salle.mjs --salle="Tour D mezzanine" --apply --confirm=ALIGNER-SALLE
//
// Les agents ont saisi plusieurs salles pour des dossiers qui viennent tous de
// la même : la salle désignée (recherche sur son nom, son code ou sa
// localisation, sans casse ni accents) doit être unique. Tous les dossiers du
// site de cette salle y sont rangés, sauf ceux engagés dans un transfert
// ouvert. La simulation liste les salles et leurs dossiers. Une ligne
// d'historique par dossier corrigé, une ligne d'audit DOSSIER_SALLE_ALIGN.
// Le script de déploiement sauvegarde la base avant --apply.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const CONFIRMATION = "ALIGNER-SALLE";

export function simplify(text) {
  return (text ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Salles dont le nom, le code ou la localisation contient tous les mots recherchés. */
export function matchSalles(salles, query) {
  const words = simplify(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  return salles.filter((salle) => {
    const text = simplify(`${salle.nom} ${salle.code} ${salle.localisation ?? ""}`);
    return words.every((word) => text.includes(word));
  });
}

async function inspect(db, query) {
  const [sites, salles, counts] = await Promise.all([
    db.site.findMany({ select: { id: true, nom: true } }),
    db.entrepot.findMany({ select: { id: true, siteId: true, nom: true, code: true, localisation: true } }),
    db.dossier.groupBy({ by: ["siteId", "entrepotId"], _count: { _all: true } }),
  ]);
  const matches = matchSalles(salles, query);
  return { sites, salles, counts, matches };
}

export async function alignDossierSalle(db, { query, apply = false }) {
  const report = await inspect(db, query);
  if (report.matches.length !== 1) return { applied: false, report };
  const target = report.matches[0];
  const engaged = await db.transferLotDossier.findMany({
    where: { transferLotItem: { status: { in: ["PREVU", "SORTI", "RECU"] }, transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } } } },
    select: { dossierId: true },
  });
  const engagedIds = [...new Set(engaged.map((row) => row.dossierId))];
  // Sans salle (NULL) compris : « NOT entrepotId = X » écarterait les NULL en SQL.
  const elsewhere = { OR: [{ entrepotId: null }, { entrepotId: { not: target.id } }] };
  const where = { siteId: target.siteId, ...elsewhere, ...(engagedIds.length ? { id: { notIn: engagedIds } } : {}) };
  const toMove = await db.dossier.count({ where });
  const skipped = engagedIds.length
    ? await db.dossier.count({ where: { siteId: target.siteId, ...elsewhere, id: { in: engagedIds } } })
    : 0;
  if (!apply) return { applied: false, report, target, toMove, skipped };

  const moved = await db.$transaction(async (tx) => {
    const dossiers = await tx.dossier.findMany({ where, select: { id: true, entrepotId: true } });
    const ids = dossiers.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = dossiers.slice(i, i + 1000);
      await tx.dossier.updateMany({ where: { id: { in: chunk.map((d) => d.id) } }, data: { entrepotId: target.id } });
      await tx.dossierHistory.createMany({
        data: chunk.map((d) => ({
          dossierId: d.id,
          action: "DOSSIER_SALLE_CORRIGEE",
          commentaire: `Salle corrigée : ${target.nom} (saisie d'origine erronée).`,
          metadata: { from: d.entrepotId, to: target.id },
        })),
      });
    }
    await tx.auditLog.create({
      data: { action: "DOSSIER_SALLE_ALIGN", entity: "ENTREPOT", entityId: target.id, newValue: { siteId: target.siteId, moved: ids.length, skippedInTransfer: skipped } },
    });
    return ids.length;
  }, { maxWait: 10_000, timeout: 300_000 });
  return { applied: true, report, target, toMove, skipped, moved };
}

function print(result, query) {
  const { report } = result;
  const siteName = new Map(report.sites.map((s) => [s.id, s.nom]));
  const salleName = new Map(report.salles.map((s) => [s.id, s.nom]));
  console.log("Dossiers par site et salle :");
  for (const row of [...report.counts].sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  - ${siteName.get(row.siteId) ?? "Sans site"} / ${row.entrepotId ? salleName.get(row.entrepotId) ?? `salle ${row.entrepotId}` : "sans salle"} : ${row._count._all}`);
  }
  console.log("\nSalles existantes :");
  for (const salle of report.salles) console.log(`  - #${salle.id} ${salle.nom} (${salle.code})${salle.localisation ? ` — ${salle.localisation}` : ""} · ${siteName.get(salle.siteId) ?? "?"}`);
  if (report.matches.length !== 1) {
    console.log(`\nLa recherche « ${query} » désigne ${report.matches.length} salle(s) : précisez le nom pour n'en désigner qu'une.`);
    return;
  }
  console.log(`\nSalle retenue : #${result.target.id} ${result.target.nom} (${siteName.get(result.target.siteId)})`);
  console.log(`Dossiers ${result.applied ? "rangés" : "à ranger"} dans cette salle : ${result.applied ? result.moved : result.toMove}`);
  if (result.skipped) console.log(`Dossiers laissés en place car engagés dans un transfert ouvert : ${result.skipped}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const salleArg = args.find((arg) => arg.startsWith("--salle="));
  const query = salleArg?.slice("--salle=".length) ?? "";
  const prisma = new PrismaClient();
  try {
    const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm=") && arg !== salleArg);
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (!query.trim()) throw new Error("--salle est requis.");
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const result = await alignDossierSalle(prisma, { query, apply });
    console.log(apply ? "CORRECTION APPLIQUÉE :" : "SIMULATION — aucune donnée modifiée.");
    print(result, query);
    if (apply && !result.applied) process.exitCode = 1;
  } catch (error) {
    console.error(`Alignement des salles échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
