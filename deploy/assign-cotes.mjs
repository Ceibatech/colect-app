// Reprise des cotes du référentiel de classement MULCV et de la nature ACD.
//
//   node deploy/assign-cotes.mjs                                      → simulation
//   node deploy/assign-cotes.mjs --apply --confirm=COTER-ARCHIVES      → application
//
// 1. Nature : tous les dossiers passent à « Dossiers ACD » (code ACD, rubrique 2010).
// 2. Communes : chaque commune utilisée reçoit son sigle (KOU, MAR, PBT…).
// 3. Cartons sans cote : 2010-<commune majoritaire>-<n°>, numérotés par commune
//    dans l'ordre d'inventaire (identifiant CTN croissant).
// 4. Dossiers sans rang : n° dans le carton, dans l'ordre de saisie, à la suite
//    des dossiers déjà numérotés : 2010-KOU-0001-012.
// Une cote déjà attribuée n'est jamais modifiée (elle est imprimée).
// Le script de déploiement sauvegarde la base avant --apply.
// Règles miroir de src/lib/cartons/cote.ts : garder les deux alignés.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

export const CONFIRMATION = "COTER-ARCHIVES";
export const CLASSEMENT_ACD = "2010";
const SIGLE_INCONNU = "XXX";
const SIGLES_CONNUS = {
  abobo: "ABO", adjame: "ADJ", anyama: "ANY", attecoube: "ATT", bingerville: "BIN",
  cocody: "COC", koumassi: "KOU", marcory: "MAR", plateau: "PLA", portbouet: "PBT",
  songon: "SON", treichville: "TRE", yopougon: "YOP", adzope: "ADZ", aboisso: "ABS",
  grandbassam: "GBA", dabou: "DAB", jacqueville: "JAC", bonoua: "BNA", alepe: "ALP",
  agboville: "AGB", tiassale: "TIA", yamoussoukro: "YAM", bouake: "BKE", sanpedro: "SPE",
};

export function simplifyName(name) {
  return (name ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function proposeSigle(nom) {
  const key = simplifyName(nom);
  if (SIGLES_CONNUS[key]) return SIGLES_CONNUS[key];
  const letters = key.replace(/[^a-z]/g, "");
  return letters.length >= 3 ? letters.slice(0, 3).toUpperCase() : SIGLE_INCONNU;
}

export const formatCartonCote = (prefixe, sequence) => `${prefixe}-${String(sequence).padStart(4, "0")}`;

/** Sigles des communes : ceux déjà attribués sont gardés ; les nouveaux évitent les doublons. */
export function planSigles(communes) {
  const taken = new Set(communes.filter((c) => c.sigle).map((c) => c.sigle));
  const plan = new Map();
  for (const commune of [...communes].sort((a, b) => a.id - b.id)) {
    if (commune.sigle) { plan.set(commune.id, commune.sigle); continue; }
    const base = proposeSigle(commune.nom);
    let sigle = base;
    for (let attempt = 1; taken.has(sigle) && attempt < 27; attempt++) sigle = `${base.slice(0, 2)}${String.fromCharCode(64 + attempt)}`;
    taken.add(sigle);
    plan.set(commune.id, sigle);
  }
  return plan;
}

/** Cotes des cartons sans cote : commune majoritaire, puis n° suivant de la commune, dans l'ordre CTN. */
export function planCartons(cartons, sigleOf, lastSequence) {
  const next = new Map(lastSequence);
  const plan = [];
  for (const carton of [...cartons].sort((a, b) => a.id - b.id)) {
    let best = null;
    let bestCount = 0;
    for (const [communeId, count] of carton.communes) if (communeId != null && count > bestCount) { best = communeId; bestCount = count; }
    const sigle = best != null ? sigleOf.get(best) ?? SIGLE_INCONNU : SIGLE_INCONNU;
    const prefixe = `${CLASSEMENT_ACD}-${sigle}`;
    const sequence = (next.get(prefixe) ?? 0) + 1;
    next.set(prefixe, sequence);
    const total = [...carton.communes.values()].reduce((sum, n) => sum + n, 0);
    plan.push({ id: carton.id, prefixe, sequence, cote: formatCartonCote(prefixe, sequence), mixte: carton.communes.size > 1, total, majoritaire: bestCount });
  }
  return plan;
}

async function inspect(db) {
  const [natures, natureCounts, communes, groups, cotes, pendingDossiers, total] = await Promise.all([
    db.natureDossier.findMany({ select: { id: true, code: true, libelle: true } }),
    db.dossier.groupBy({ by: ["natureDossierId"], _count: { _all: true } }),
    db.commune.findMany({ select: { id: true, nom: true, sigle: true } }),
    db.dossier.groupBy({ by: ["cartonId", "communeId"], where: { cartonId: { not: null }, carton: { cote: null } }, _count: { _all: true } }),
    db.carton.groupBy({ by: ["cotePrefixe"], where: { cote: { not: null } }, _max: { coteSequence: true } }),
    db.dossier.count({ where: { cartonId: { not: null }, rangCarton: null } }),
    db.dossier.count(),
  ]);
  const cartons = new Map();
  for (const row of groups) {
    if (!cartons.has(row.cartonId)) cartons.set(row.cartonId, { id: row.cartonId, communes: new Map() });
    cartons.get(row.cartonId).communes.set(row.communeId, row._count._all);
  }
  const usedCommunes = new Set(groups.map((g) => g.communeId).filter((id) => id != null));
  const sigles = planSigles(communes.filter((c) => c.sigle || usedCommunes.has(c.id)));
  const lastSequence = new Map(cotes.map((row) => [row.cotePrefixe, row._max.coteSequence ?? 0]));
  const cartonPlan = planCartons([...cartons.values()], sigles, lastSequence);
  return { natures, natureCounts, communes, sigles, cartonPlan, pendingDossiers, total };
}

const NATURE_ACD = { code: "ACD", libelle: "Dossiers ACD", description: "Référentiel de classement MULCV — 2010 : Dossiers ACD (série 2000, Gestion des actes du foncier)." };

export async function assignCotes(db, { apply = false, nature = true } = {}) {
  const report = await inspect(db);
  if (!apply) return { applied: false, report };

  const result = await db.$transaction(async (tx) => {
    let natureUpdated = 0;
    if (nature) {
      const acd = await tx.natureDossier.upsert({ where: { code: NATURE_ACD.code }, update: { isActive: true }, create: NATURE_ACD });
      natureUpdated = (await tx.dossier.updateMany({ where: { OR: [{ natureDossierId: null }, { natureDossierId: { not: acd.id } }] }, data: { natureDossierId: acd.id } })).count;
    }
    for (const [communeId, sigle] of report.sigles) {
      await tx.commune.updateMany({ where: { id: communeId, sigle: null }, data: { sigle } });
    }
    for (let i = 0; i < report.cartonPlan.length; i += 500) {
      const chunk = report.cartonPlan.slice(i, i + 500);
      const ids = chunk.map((c) => c.id);
      const caseOf = (field) => Prisma.join(chunk.map((c) => Prisma.sql`WHEN ${c.id} THEN ${c[field]}`), " ");
      await tx.$executeRaw(Prisma.sql`
        UPDATE cartons SET
          cote = CASE id ${caseOf("cote")} END,
          cote_prefixe = CASE id ${caseOf("prefixe")} END,
          cote_sequence = CASE id ${caseOf("sequence")} END
        WHERE id IN (${Prisma.join(ids)}) AND cote IS NULL`);
    }
    // Dossiers sans rang : à la suite des dossiers déjà numérotés du carton, dans l'ordre de saisie.
    const dossiers = await tx.$executeRaw(Prisma.sql`
      UPDATE dossiers d
      JOIN (
        SELECT p.id, p.carton_id,
          ROW_NUMBER() OVER (PARTITION BY p.carton_id ORDER BY p.id) + COALESCE(m.max_rang, 0) AS rang
        FROM dossiers p
        LEFT JOIN (SELECT carton_id, MAX(rang_carton) AS max_rang FROM dossiers WHERE rang_carton IS NOT NULL GROUP BY carton_id) m ON m.carton_id = p.carton_id
        WHERE p.carton_id IS NOT NULL AND p.rang_carton IS NULL
      ) r ON r.id = d.id
      JOIN cartons c ON c.id = d.carton_id AND c.cote IS NOT NULL
      SET d.rang_carton = r.rang,
          d.cote = CONCAT(c.cote, '-', IF(r.rang < 1000, LPAD(r.rang, 3, '0'), r.rang))`);
    await tx.auditLog.create({
      data: { action: "COTES_REFERENTIEL", entity: "CARTON", newValue: { cartons: report.cartonPlan.length, dossiers, natureUpdated } },
    });
    return { cartons: report.cartonPlan.length, dossiers, natureUpdated };
  }, { maxWait: 10_000, timeout: 900_000 });
  return { applied: true, report, ...result };
}

function print(result) {
  const { report } = result;
  const natureName = new Map(report.natures.map((n) => [n.id, `${n.libelle} (${n.code})`]));
  const communeName = new Map(report.communes.map((c) => [c.id, c.nom]));
  console.log(`Dossiers : ${report.total}`);
  console.log("\nNatures actuelles (toutes passeront à « Dossiers ACD ») :");
  for (const row of [...report.natureCounts].sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  - ${row.natureDossierId ? natureName.get(row.natureDossierId) ?? `nature ${row.natureDossierId}` : "non renseignée"} : ${row._count._all}`);
  }
  console.log("\nSigles des communes :");
  for (const [id, sigle] of report.sigles) console.log(`  - ${sigle} = ${communeName.get(id)}`);
  const byPrefix = new Map();
  for (const carton of report.cartonPlan) byPrefix.set(carton.prefixe, (byPrefix.get(carton.prefixe) ?? 0) + 1);
  console.log(`\nCartons à coter : ${report.cartonPlan.length}`);
  for (const [prefixe, count] of [...byPrefix].sort((a, b) => b[1] - a[1])) console.log(`  - ${prefixe}-… : ${count} carton(s)`);
  console.log("\nExemples :");
  for (const carton of report.cartonPlan.slice(0, 8)) console.log(`  - CTN-${String(carton.id).padStart(8, "0")} → ${carton.cote} (${carton.total} dossiers → ${carton.cote}-001 … -${String(carton.total).padStart(3, "0")})`);
  const mixed = report.cartonPlan.filter((c) => c.mixte);
  console.log(`\nCartons dont les dossiers viennent de plusieurs communes (commune majoritaire retenue) : ${mixed.length}`);
  for (const carton of mixed.slice(0, 30)) console.log(`  - CTN-${String(carton.id).padStart(8, "0")} → ${carton.cote} : ${carton.majoritaire}/${carton.total} dossiers de la commune retenue`);
  console.log(`\nDossiers à numéroter dans leur carton : ${report.pendingDossiers}`);
  if (result.applied) console.log(`\nAPPLIQUÉ : ${result.cartons} carton(s) cotés, ${result.dossiers} dossier(s) numérotés, nature ACD sur ${result.natureUpdated} dossier(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm="));
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const result = await assignCotes(prisma, { apply });
    console.log(apply ? "COTATION APPLIQUÉE :" : "SIMULATION — aucune donnée modifiée.");
    print(result);
  } catch (error) {
    console.error(`Cotation échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
