// Recoupe des cartons de Koumassi sur les boîtes physiques.
//
//   node deploy/recouper-cartons.mjs                                       → simulation
//   node deploy/recouper-cartons.mjs --apply --confirm=RECOUPER-CARTONS     → application
//
// À l'inventaire, un carton regroupait tout un lotissement (ex. « Koumassi »,
// 1 303 dossiers). La boîte physique est donnée par la « référence de
// classement » du dossier (ex. « lots 16-116 »), celle de la liste
// d'enlèvement. Le script :
// 1. regroupe les dossiers des cartons 2010-KOU par référence de classement
//    (un dossier sans référence reste avec son carton d'origine) ;
// 2. cote d'abord les 200 boîtes de la liste d'enlèvement, dans l'ordre de leur
//    référence provisoire (1 → 2010-KOU-0001…), même vides ; puis les autres
//    boîtes dans l'ordre des anciennes cotes ;
// 3. numérote les dossiers de chaque boîte 001, 002… sans trou.
// Aucune étiquette n'ayant été imprimée pour Koumassi, les cotes KOU peuvent
// être réattribuées. Le script de déploiement sauvegarde la base avant --apply.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

export const CONFIRMATION = "RECOUPER-CARTONS";
export const PREFIXE = "2010-KOU";

/**
 * Clé de boîte : « lots 424-1700 », « Lots 424 - 1700 » et « 424-1700 »
 * désignent la même boîte ; « 18 B-1780 » = « 18B-1780 ».
 */
export function norm(value) {
  return (value ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/\bilots?\b/g, "ilot").replace(/^\s*lots?\b\s*/, "").replace(/\blots?\b/g, "lot")
    .replace(/(\d)\s+([a-z])\b/g, "$1$2")
    .replace(/\s*-+\s*/g, "-")
    .replace(/[^a-z0-9-]+/g, " ").trim();
}

/**
 * Bornes de la boîte, quelle que soit l'écriture : « lots 82-1575 »,
 * « ILOT 11 LOTS 82-1575 », « Îlot 11-97/148-252 » (→ 148-252),
 * « 2614 à 2623 », « îlot 66 lots 929 », « 154bis-564 » (→ 154-564).
 */
export function cleBoite(value) {
  const text = norm((value ?? "").replace(/\s+(?:à|a|au)\.?\s+/gi, "-")).replace(/bis\b/g, "").replace(/\s*:\s*/g, " ");
  const ranges = [...text.matchAll(/([a-z]?\d+[a-z]?|[a-z]\d*)\s*-\s*([a-z]?\d+[a-z]?|[a-z]\d*)(?![\w])/g)];
  if (ranges.length) {
    const last = ranges.at(-1);
    return `${last[1]}-${last[2]}`;
  }
  const single = text.match(/lot\s+([a-z0-9]+)\s*$/) ?? text.match(/^([a-z0-9]+)$/);
  return single ? single[1] : null;
}

/** Même première borne et seconde borne à 5 près : faute de frappe probable (« 18B-1782 » / « 18B-1780 »). */
function proche(a, b) {
  const [a1, a2] = a.split("-");
  const [b1, b2] = b.split("-");
  if (!a2 || !b2 || a1 !== b1) return null;
  const x = Number(a2.replace(/\D/g, ""));
  const y = Number(b2.replace(/\D/g, ""));
  return Number.isFinite(x) && Number.isFinite(y) && a2.replace(/\d/g, "") === b2.replace(/\d/g, "") && Math.abs(x - y) <= 5 ? Math.abs(x - y) : null;
}

export const formatCote = (sequence) => `${PREFIXE}-${String(sequence).padStart(4, "0")}`;
export const formatDossierCote = (cote, rang) => `${cote}-${rang < 1000 ? String(rang).padStart(3, "0") : rang}`;

function loadListe() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return JSON.parse(readFileSync(path.join(here, "enlevement-koumassi.json"), "utf8"));
}

/**
 * Plan pur (testé) : dossiers { id, cartonId, ancienneCote, rang, reference } →
 * boîtes cotées. Une référence partagée par deux boîtes de la liste va à la
 * première ; la seconde est créée vide et signalée.
 */
export function planRecoupe(dossiers, liste) {
  const groupes = new Map();
  for (const dossier of dossiers) {
    const ref = norm(dossier.reference);
    const key = ref ? `ref:${ref}` : `carton:${dossier.cartonId}`;
    if (!groupes.has(key)) groupes.set(key, { key, reference: ref ? dossier.reference.trim() : null, dossiers: [] });
    groupes.get(key).dossiers.push(dossier);
  }
  const ordreDossier = (a, b) => (a.ancienneCote ?? "").localeCompare(b.ancienneCote ?? "") || (a.rang ?? 1e9) - (b.rang ?? 1e9) || a.id - b.id;
  for (const groupe of groupes.values()) {
    groupe.dossiers.sort(ordreDossier);
    groupe.premier = groupe.dossiers[0];
  }

  const boites = [];
  const pris = new Set();
  const partagees = [];
  // Groupes de référence par bornes de boîte (plusieurs écritures d'une même boîte).
  const parCle = new Map();
  for (const groupe of groupes.values()) {
    const cle = groupe.reference ? cleBoite(groupe.reference) : null;
    if (!cle) continue;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(groupe);
  }
  // Même boîte à une lettre près (« 3358A-3396 » / « 3358-3396 »).
  const sansLettres = (cle) => (/\d/.test(cle) ? cle.replace(/[a-z]/g, "") : cle);
  const parCleSansLettres = new Map();
  for (const [cle, groupesCle] of parCle) {
    const simple = sansLettres(cle);
    parCleSansLettres.set(simple, [...(parCleSansLettres.get(simple) ?? []), ...groupesCle]);
  }
  const libres = (liste_) => liste_.filter((groupe) => !pris.has(groupe.key));
  for (const boite of liste) {
    const cle = cleBoite(boite.libelle);
    let trouves = cle ? parCle.get(cle) ?? [] : [];
    let correspondance = trouves.length ? "exacte" : null;
    if (!libres(trouves).length && cle && libres(parCleSansLettres.get(sansLettres(cle)) ?? []).length) {
      trouves = parCleSansLettres.get(sansLettres(cle));
      correspondance = "proche";
    }
    if (!trouves.length && cle) {
      // Faute de frappe probable : la clé la plus proche encore libre.
      let best = null;
      for (const [autre, groupesCle] of parCle) {
        const ecart = proche(cle, autre);
        if (ecart != null && libres(groupesCle).length && (!best || ecart < best.ecart)) best = { ecart, groupesCle };
      }
      if (best) { trouves = best.groupesCle; correspondance = "proche"; }
    }
    const disponibles = libres(trouves);
    if (trouves.length && !disponibles.length) partagees.push(boite.ref);
    for (const groupe of disponibles) pris.add(groupe.key);
    const dossiersBoite = disponibles.flatMap((groupe) => groupe.dossiers).sort(ordreDossier);
    boites.push({
      listeRef: boite.ref, libelle: boite.libelle,
      reference: disponibles.map((groupe) => groupe.reference).join(" / ") || boite.libelle,
      dossiers: dossiersBoite, trouvee: dossiersBoite.length > 0, correspondance: dossiersBoite.length ? correspondance : null,
    });
  }
  const reste = [...groupes.values()].filter((groupe) => !pris.has(groupe.key))
    .sort((a, b) => ordreDossier(a.premier, b.premier));
  for (const groupe of reste) boites.push({ listeRef: null, libelle: null, reference: groupe.reference, dossiers: groupe.dossiers, trouvee: true });
  boites.forEach((boite, index) => { boite.sequence = index + 1; boite.cote = formatCote(index + 1); });
  return { boites, partagees };
}

async function charger(db) {
  return db.$queryRaw(Prisma.sql`
    SELECT d.id, d.carton_id AS cartonId, c.cote AS ancienneCote, d.rang_carton AS rang, d.reference_classement AS reference
    FROM dossiers d JOIN cartons c ON c.id = d.carton_id
    WHERE c.cote_prefixe = ${PREFIXE}`);
}

async function references(db) {
  const [lots, caisses] = await Promise.all([
    db.$queryRaw(Prisma.sql`
      SELECT l.reference, l.status, COUNT(*) AS n
      FROM transfer_lot_items i JOIN cartons c ON c.id = i.carton_id JOIN transfer_lots l ON l.id = i.transfer_lot_id
      WHERE c.cote_prefixe = ${PREFIXE} GROUP BY l.id, l.reference, l.status`),
    db.$queryRaw(Prisma.sql`SELECT COUNT(*) AS n FROM cartons c WHERE c.cote_prefixe = ${PREFIXE} AND (c.caisse_id IS NOT NULL OR EXISTS (SELECT 1 FROM caisse_mouvements m WHERE m.carton_id = c.id))`),
  ]);
  const detail = lots.map((row) => ({ reference: row.reference, status: row.status, cartons: Number(row.n) }));
  return { lots: detail.reduce((sum, row) => sum + row.cartons, 0), lotsDetail: detail, caisses: Number(caisses[0].n) };
}

export async function recouper(db, { apply = false } = {}) {
  const dossiers = (await charger(db)).map((row) => ({ ...row, id: Number(row.id), cartonId: Number(row.cartonId), rang: row.rang == null ? null : Number(row.rang) }));
  const anciensCartons = [...new Set(dossiers.map((d) => d.cartonId))];
  const plan = planRecoupe(dossiers, loadListe().boites);
  const refs = await references(db);
  const report = { dossiers: dossiers.length, anciensCartons: anciensCartons.length, ...plan, refs };
  if (!apply) return { applied: false, report };
  if (refs.lots || refs.caisses) throw new Error("Des cartons KOU sont engagés dans un transfert ou un conteneur : recoupe refusée.");

  const started = Date.now();
  const step = (label) => console.error(`  … ${label} (${Math.round((Date.now() - started) / 1000)} s)`);
  // Cartons à créer : clé technique provisoire pour retrouver leurs identifiants.
  const disponibles = [...anciensCartons].sort((a, b) => a - b);
  const manquants = Math.max(0, plan.boites.length - disponibles.length);
  const result = await db.$transaction(async (tx) => {
    const marque = `recoupe-${Date.now()}-`;
    if (manquants) {
      await tx.carton.createMany({ data: Array.from({ length: manquants }, (_, i) => ({ legacyKey: `${marque}${i}` })) });
      const crees = await tx.carton.findMany({ where: { legacyKey: { startsWith: marque } }, orderBy: { id: "asc" }, select: { id: true } });
      disponibles.push(...crees.map((row) => row.id));
    }
    step(`${manquants} carton(s) créé(s)`);
    plan.boites.forEach((boite, index) => { boite.cartonId = disponibles[index]; });
    const restants = disponibles.slice(plan.boites.length);

    // Libère les cotes et rangs KOU (contraintes d'unicité), puis réattribue en masse.
    await tx.$executeRaw(Prisma.sql`UPDATE dossiers SET rang_carton = NULL, cote = NULL WHERE id IN (SELECT id FROM (SELECT d.id FROM dossiers d JOIN cartons c ON c.id = d.carton_id WHERE c.cote_prefixe = ${PREFIXE}) x)`);
    await tx.$executeRaw(Prisma.sql`UPDATE cartons SET cote = NULL, cote_sequence = NULL, cote_prefixe = NULL WHERE cote_prefixe = ${PREFIXE}`);
    step("anciennes cotes libérées");
    for (let i = 0; i < plan.boites.length; i += 500) {
      const chunk = plan.boites.slice(i, i + 500);
      const caseOf = (value) => Prisma.join(chunk.map((b) => Prisma.sql`WHEN ${b.cartonId} THEN ${value(b)}`), " ");
      await tx.$executeRaw(Prisma.sql`
        UPDATE cartons SET cote = CASE id ${caseOf((b) => b.cote)} END,
          cote_prefixe = ${PREFIXE},
          cote_sequence = CASE id ${caseOf((b) => b.sequence)} END,
          legacy_key = NULL
        WHERE id IN (${Prisma.join(chunk.map((b) => b.cartonId))})`);
    }
    step("cartons cotés");
    const lignes = plan.boites.flatMap((boite) => boite.dossiers.map((dossier, index) => ({ id: dossier.id, cartonId: boite.cartonId, rang: index + 1, cote: formatDossierCote(boite.cote, index + 1) })));
    for (let i = 0; i < lignes.length; i += 1000) {
      const chunk = lignes.slice(i, i + 1000);
      const caseOf = (value) => Prisma.join(chunk.map((l) => Prisma.sql`WHEN ${l.id} THEN ${value(l)}`), " ");
      await tx.$executeRaw(Prisma.sql`
        UPDATE dossiers SET carton_id = CASE id ${caseOf((l) => l.cartonId)} END,
          rang_carton = CASE id ${caseOf((l) => l.rang)} END,
          cote = CASE id ${caseOf((l) => l.cote)} END
        WHERE id IN (${Prisma.join(chunk.map((l) => l.id))})`);
    }
    step(`${lignes.length} dossiers renumérotés`);
    // Anciens cartons vidés et sans historique : supprimés.
    const vides = restants.length ? await tx.carton.deleteMany({ where: { id: { in: restants }, dossiers: { none: {} }, transferLotItems: { none: {} }, caisseMouvements: { none: {} } } }) : { count: 0 };
    await tx.auditLog.create({ data: { action: "RECOUPE_CARTONS", entity: "CARTON", newValue: { prefixe: PREFIXE, boites: plan.boites.length, dossiers: dossiers.length, crees: manquants, supprimes: vides.count } } });
    step("terminé");
    return { crees: manquants, supprimes: vides.count };
  }, { maxWait: 10_000, timeout: 600_000 });
  return { applied: true, report, ...result };
}

function print(result) {
  const { report } = result;
  const liste = report.boites.filter((b) => b.listeRef != null);
  const trouvees = liste.filter((b) => b.dossiers.length);
  console.log(`Dossiers dans les cartons ${PREFIXE} : ${report.dossiers} (aujourd'hui ${report.anciensCartons} cartons)`);
  console.log(`Après recoupe : ${report.boites.length} cartons ${PREFIXE}`);
  console.log(`\nListe d'enlèvement : ${liste.length} boîtes → ${PREFIXE}-0001 à ${formatCote(liste.length)}`);
  console.log(`  - retrouvées dans la base : ${trouvees.length} (${trouvees.reduce((s, b) => s + b.dossiers.length, 0)} dossiers), dont ${trouvees.filter((b) => b.correspondance === "proche").length} par une référence proche (faute de frappe probable)`);
  console.log(`  - sans dossier en base (carton créé vide, dossiers rattachés à l'inventaire) : ${liste.length - trouvees.length}`);
  if (report.partagees.length) console.log(`  - même référence qu'une boîte précédente (créée vide, à départager) : n° ${report.partagees.join(", ")}`);
  console.log("\nBoîtes de la liste :");
  for (const b of liste) console.log(`  ${String(b.listeRef).padStart(3)} | ${b.cote} | ${b.libelle} | ${b.dossiers.length} dossier(s)${b.correspondance === "proche" ? ` | référence proche en base : ${b.reference}` : b.dossiers.length && b.reference !== b.libelle ? ` | en base : ${b.reference}` : ""}`);
  const suivants = report.boites.filter((b) => b.listeRef == null);
  console.log(`\nAutres boîtes (${suivants.length}) — les 120 suivantes :`);
  for (const b of suivants.slice(0, 120)) console.log(`  ${b.cote} | ${b.reference ?? "sans référence (carton d'origine)"} | ${b.dossiers.length} dossier(s)`);
  const sansRef = suivants.filter((b) => !b.reference);
  console.log(`\nCartons gardés faute de référence de classement : ${sansRef.length} (${sansRef.reduce((s, b) => s + b.dossiers.length, 0)} dossiers)`);
  const tailles = report.boites.map((b) => b.dossiers.length).sort((a, b) => b - a);
  console.log(`Plus grosses boîtes : ${tailles.slice(0, 10).join(", ")}`);
  console.log(`Cartons KOU engagés dans un transfert : ${report.refs.lots} ; dans un conteneur : ${report.refs.caisses}`);
  for (const lot of report.refs.lotsDetail) console.log(`  - lot ${lot.reference} (${lot.status}) : ${lot.cartons} carton(s)`);
  if (result.applied) console.log(`\nAPPLIQUÉ : ${report.boites.length} cartons cotés, ${result.crees} créés, ${result.supprimes} anciens cartons vides supprimés.`);
  else console.log("\nSIMULATION : rien n'a été modifié.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes(`--confirm=${CONFIRMATION}`)) {
    console.error(`Confirmation requise : --confirm=${CONFIRMATION}`);
    process.exit(1);
  }
  const db = new PrismaClient();
  recouper(db, { apply }).then(print).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
}
