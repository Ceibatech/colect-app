// Reprise des cotes dans la codification FONCTION V3 (proposition du 04/11/2026).
//
//   node deploy/recoder-cotes.mjs                                     → simulation, rien n'est modifié
//   node deploy/recoder-cotes.mjs --apply --confirm=RECODER-COTES     → application
//
// 1. Communes : chaque commune de la base reçoit son identifiant figé du
//    référentiel RGPH (CI-COM-113 → 113), par son code « CI-113 » ou son nom,
//    avec district, région et département.
// 2. Cartons : 2010-KOU-0001 devient FON-3302-113-0001 (même numéro). Les ACD
//    des communes à direction régionale prennent leur rubrique 7x12
//    (Grand-Bassam : FON-7102-083-…). L'ancienne cote est gardée en alias
//    (cote_ancienne) : les étiquettes déjà posées restent lues.
// 3. Dossiers : 2010-KOU-0001-012 devient FON-3302-113-0001-012, ancienne cote en alias.
// 4. Nature : « 2010 · Dossiers ACD » devient « FON-3302 · Dossiers ACD ».
// Un carton dont la commune n'est pas dans le référentiel garde sa cote (listé).
// Règles miroir de src/lib/referentiel/codification.ts : garder les deux alignés.
// Le script serveur sauvegarde la base avant --apply.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const CONFIRMATION = "RECODER-COTES";
export const RUBRIQUE_ACD = "FON-3302";
export const ACD_DIRECTION_REGIONALE = {
  196: "FON-7012", "043": "FON-7022", 108: "FON-7032", "051": "FON-7042", 153: "FON-7052",
  "050": "FON-7062", "095": "FON-7072", "038": "FON-7082", "016": "FON-7092", "083": "FON-7102",
};
const VARIANTES = { assiniemafia: "016", portbouet: "147", portbouetvridi: "147", sanpedro: "153", jacquesville: "095" };
const ANCIEN_PREFIXE = /^(\d{4})-([A-Z][A-Z0-9]{1,5})$/;

export function simplify(name) {
  return String(name ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function loadCommunes() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const file = [path.join(here, "communes-ci.json"), path.join(here, "..", "src", "lib", "referentiel", "communes-ci.json")].find(existsSync);
  if (!file) throw new Error("Référentiel des communes introuvable (communes-ci.json).");
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Identifiant RGPH d'une commune de la base : déjà posé, code « CI-113 », ou nom. */
export function identifiantPour(commune, referentiel) {
  if (commune.identifiant) return commune.identifiant;
  const code = /^CI-(?:COM-)?(\d{3})$/i.exec(String(commune.code ?? "").trim());
  if (code && referentiel.some((c) => c.identifiant === code[1])) return code[1];
  const key = simplify(commune.nom);
  return referentiel.find((c) => simplify(c.nom) === key)?.identifiant ?? VARIANTES[key] ?? null;
}

/** Nouveau préfixe d'un ancien préfixe ACD : 2010-KOU + 113 → FON-3302-113 (ou 7x12 en région). */
export function nouveauPrefixe(ancien, identifiant) {
  const match = ANCIEN_PREFIXE.exec(ancien);
  if (!match || match[1] !== "2010" || !/^\d{3}$/.test(identifiant ?? "")) return null;
  const key = ACD_DIRECTION_REGIONALE[identifiant] ?? RUBRIQUE_ACD;
  return `${key}-${identifiant}`;
}

/** Plan de reprise, sans rien écrire. */
export async function planRecodage(db, referentiel = loadCommunes()) {
  const communes = await db.commune.findMany({ select: { id: true, code: true, nom: true, sigle: true, identifiant: true } });
  const pris = new Map(communes.filter((c) => c.identifiant).map((c) => [c.identifiant, c.id]));
  const communeUpdates = [];
  const conflits = [];
  for (const commune of communes) {
    if (commune.identifiant) continue;
    const identifiant = identifiantPour(commune, referentiel);
    if (!identifiant) continue;
    if (pris.has(identifiant) && pris.get(identifiant) !== commune.id) { conflits.push(`${commune.nom} → ${identifiant} (déjà pris)`); continue; }
    pris.set(identifiant, commune.id);
    const ref = referentiel.find((c) => c.identifiant === identifiant);
    communeUpdates.push({ id: commune.id, nom: commune.nom, identifiant, district: ref?.district ?? null, region: ref?.region ?? null, departement: ref?.departement ?? null });
  }
  const identifiantDe = new Map(communes.map((c) => [c.id, c.identifiant ?? communeUpdates.find((u) => u.id === c.id)?.identifiant ?? null]));
  const communeDuSigle = new Map(communes.filter((c) => c.sigle).map((c) => [c.sigle, c]));

  const prefixes = await db.$queryRawUnsafe(`
    SELECT cote_prefixe AS prefixe, COUNT(*) AS cartons, MIN(cote_sequence) AS de, MAX(cote_sequence) AS a
    FROM cartons WHERE cote IS NOT NULL AND cote_ancienne IS NULL AND cote_prefixe REGEXP '^[0-9]{4}-[A-Z][A-Z0-9]{1,5}$'
    GROUP BY cote_prefixe ORDER BY cote_prefixe`);
  const plan = [];
  const ignores = [];
  for (const row of prefixes) {
    const sigle = row.prefixe.split("-")[1];
    const commune = communeDuSigle.get(sigle);
    const identifiant = commune ? identifiantDe.get(commune.id) : null;
    const cible = nouveauPrefixe(row.prefixe, identifiant);
    const entry = { ancien: row.prefixe, nouveau: cible, commune: commune?.nom ?? null, identifiant, cartons: Number(row.cartons), de: Number(row.de), a: Number(row.a) };
    if (!cible) { ignores.push({ ...entry, raison: !commune ? "sigle sans commune" : !identifiant ? "commune absente du référentiel" : "rubrique autre que 2010" }); continue; }
    // Une cote cible déjà prise (carton créé au nouveau format avec le même numéro) bloque ce préfixe.
    const [collision] = await db.$queryRawUnsafe(
      "SELECT COUNT(*) AS c FROM cartons n JOIN cartons o ON o.cote_prefixe = ? AND n.cote = CONCAT(?, SUBSTRING(o.cote, LENGTH(?) + 1))",
      row.prefixe, cible, row.prefixe);
    if (Number(collision.c) > 0) { ignores.push({ ...entry, raison: `${Number(collision.c)} cote(s) cible(s) déjà prise(s)` }); continue; }
    const [dossiers] = await db.$queryRawUnsafe(
      "SELECT COUNT(*) AS c FROM dossiers d JOIN cartons c ON c.id = d.carton_id WHERE c.cote_prefixe = ? AND d.cote LIKE CONCAT(c.cote, '-%')", row.prefixe);
    plan.push({ ...entry, dossiers: Number(dossiers.c) });
  }
  const [nature] = await db.$queryRawUnsafe("SELECT (SELECT COUNT(*) FROM natures_dossier WHERE code = '2010') AS ancienne, (SELECT COUNT(*) FROM natures_dossier WHERE code = ?) AS nouvelle", RUBRIQUE_ACD);
  return { communeUpdates, conflits, plan, ignores, nature: { ancienne: Number(nature.ancienne), nouvelle: Number(nature.nouvelle) } };
}

export async function recoderCotes(db, { apply = false } = {}) {
  const plan = await planRecodage(db);
  if (!apply) return { applied: false, plan };
  await db.$transaction(async (tx) => {
    for (const u of plan.communeUpdates) {
      await tx.commune.update({ where: { id: u.id }, data: { identifiant: u.identifiant, district: u.district, region: u.region, departement: u.departement } });
    }
    for (const p of plan.plan) {
      // Dossiers d'abord : leur nouvelle cote se déduit de l'ancienne cote du carton.
      await tx.$executeRawUnsafe(`
        UPDATE dossiers d JOIN cartons c ON c.id = d.carton_id
        SET d.cote_ancienne = d.cote, d.cote = CONCAT(?, SUBSTRING(d.cote, LENGTH(?) + 1))
        WHERE c.cote_prefixe = ? AND d.cote LIKE CONCAT(c.cote, '-%') AND d.cote_ancienne IS NULL`, p.nouveau, p.ancien, p.ancien);
      await tx.$executeRawUnsafe(`
        UPDATE cartons SET cote_ancienne = cote, cote = CONCAT(?, SUBSTRING(cote, LENGTH(?) + 1)), cote_prefixe = ?
        WHERE cote_prefixe = ? AND cote_ancienne IS NULL`, p.nouveau, p.ancien, p.nouveau, p.ancien);
    }
    if (plan.nature.ancienne && !plan.nature.nouvelle) {
      await tx.$executeRawUnsafe("UPDATE natures_dossier SET code = ?, description = 'Référentiel de classement des archives du MULCV (V3)' WHERE code = '2010'", RUBRIQUE_ACD);
    }
    await tx.auditLog.create({
      data: {
        action: "COTES_RECODAGE_V3",
        entity: "CARTON",
        newValue: { prefixes: plan.plan.map(({ ancien, nouveau, cartons, dossiers }) => ({ ancien, nouveau, cartons, dossiers })), communes: plan.communeUpdates.length, ignores: plan.ignores },
      },
    });
  }, { maxWait: 10_000, timeout: 300_000 });
  return { applied: true, plan, after: await planRecodage(db) };
}

function printPlan(plan, heading) {
  console.log(heading);
  console.log(`  Communes rattachées à leur identifiant : ${plan.communeUpdates.length}`);
  for (const u of plan.communeUpdates) console.log(`    ${u.nom} → ${u.identifiant}`);
  for (const c of plan.conflits) console.log(`    Conflit : ${c}`);
  const totals = plan.plan.reduce((t, p) => ({ cartons: t.cartons + p.cartons, dossiers: t.dossiers + p.dossiers }), { cartons: 0, dossiers: 0 });
  console.log(`  Cartons recodés : ${totals.cartons} — dossiers recodés : ${totals.dossiers}`);
  for (const p of plan.plan) {
    console.log(`    ${p.ancien}-${String(p.de).padStart(4, "0")}…${String(p.a).padStart(4, "0")} → ${p.nouveau}-${String(p.de).padStart(4, "0")}…${String(p.a).padStart(4, "0")}  (${p.commune}, ${p.cartons} cartons, ${p.dossiers} dossiers)`);
  }
  for (const i of plan.ignores) console.log(`    Inchangé : ${i.ancien} (${i.cartons} cartons) — ${i.raison}`);
  console.log(`  Nature 2010 → ${RUBRIQUE_ACD} : ${plan.nature.ancienne && !plan.nature.nouvelle ? "oui" : "rien à faire"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const prisma = new PrismaClient();
  try {
    const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm="));
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const result = await recoderCotes(prisma, { apply });
    printPlan(result.plan, apply ? "Recodage appliqué :" : "SIMULATION — aucune donnée modifiée. Serait recodé :");
    if (result.applied) printPlan(result.after, "Reste à recoder :");
  } catch (error) {
    console.error(`Recodage des cotes échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
