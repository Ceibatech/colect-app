// Reprise des fiches d'inventaire corrigées sur le terrain par les enquêteurs
// (exports Excel du formulaire : une ligne = un dossier).
//
//   node deploy/reprise-fiches.mjs                                   → simulation du dernier dépôt
//   node deploy/reprise-fiches.mjs --apply --confirm=REPRENDRE-FICHES
//
// Règles (décidées avec l'équipe) :
// - Les dossiers déjà en base sont mis à jour avec les valeurs corrigées
//   (titulaire + lot + commune, sinon titulaire + libellé du carton) ; un champ
//   vide sur la fiche n'efface jamais une valeur en base ; le carton d'un
//   dossier existant ne change pas.
// - Les lignes sans correspondance deviennent de nouveaux dossiers, rangés
//   dans le carton de même libellé (site ministère, Salle 1), sinon dans un
//   nouveau carton ; ils prennent le n° suivant du carton et la nature 2010.
// - Les dossiers en base absents des fiches restent inchangés.
// Le script de déploiement sauvegarde la base avant --apply.
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { assignCotes } from "./assign-cotes.mjs";

export const CONFIRMATION = "REPRENDRE-FICHES";
export const DEPOT_ROOT = "/var/data/documents/reprise-fiches";

export const norm = (value) => String(value ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const VIDES = new Set(["", "ras", "r a s", "n", "na", "n a", "neant", "nean", "nant", "rien", "aucun", "aucune", "nil", "nd", "x", "0", "pas de", "non", "non renseigne", "inconnu"]);

/** Valeur nettoyée : « Ras », « N », « Néant »… → null ; espaces réduits. */
export function clean(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "text" in value) value = value.text;
  if (typeof value === "object" && "result" in value) value = value.result;
  const text = String(value).replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return VIDES.has(norm(text)) ? null : text;
}

/** « 600m² », « 1 303 », « 800 mètre carré » → 600, 1303, 800. */
export function superficie(value) {
  const text = clean(value);
  if (!text) return null;
  const match = /(\d[\d\s.]*(?:,\d+)?)/.exec(text.replace(/(\d)\s+(\d)/g, "$1$2"));
  if (!match) return null;
  const n = Number(match[1].replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

const COLONNES = {
  debut: ["start time", "heure de debut"],
  libelle: ["libelle du carton"],
  codeBarres: ["code barre"],
  guichet: ["n guichet"],
  ddu: ["n ddu"],
  reference: ["references de classement"],
  ilot: ["n ilot"],
  lot: ["n lot"],
  superficie: ["superficie"],
  tf: ["n titre foncier"],
  lotissement: ["lotissement"],
  commune: ["commune s"],
  nature: ["nature de dossier"],
  nom: ["nom", "nom1"],
  prenoms: ["prenoms"],
  adresse: ["adresse"],
  telephone: ["telephone"],
  email: ["e mail"],
};

function headerIndex(headers) {
  const keys = headers.map((h) => norm(h));
  const index = {};
  for (const [field, names] of Object.entries(COLONNES)) {
    const i = keys.findIndex((k) => names.includes(k));
    if (i >= 0) index[field] = i;
  }
  return index;
}

export async function readFiche(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  const rows = [];
  let index = null;
  sheet.eachRow({ includeEmpty: false }, (row, number) => {
    const values = row.values.slice(1);
    if (!index) { index = headerIndex(values); return; }
    const get = (field) => (index[field] == null ? null : values[index[field]]);
    const record = {
      fichier: path.basename(file), ligne: number,
      debut: get("debut") instanceof Date ? get("debut") : null,
      libelle: clean(get("libelle")), codeBarres: clean(get("codeBarres")), guichet: clean(get("guichet")), ddu: clean(get("ddu")),
      reference: clean(get("reference")), ilot: clean(get("ilot")), lot: clean(get("lot")), superficie: superficie(get("superficie")),
      tf: clean(get("tf")), lotissement: clean(get("lotissement")), commune: clean(get("commune")), nature: clean(get("nature")),
      nom: clean(get("nom")), prenoms: clean(get("prenoms")), adresse: clean(get("adresse")), telephone: clean(get("telephone")), email: clean(get("email")),
    };
    if (record.nom || record.prenoms || record.lot || record.libelle) rows.push(record);
  });
  if (!index || index.libelle == null || index.nom == null) throw new Error(`${path.basename(file)} : colonnes du formulaire d'inventaire introuvables.`);
  return rows;
}

const VARIANTES_COMMUNES = [["koumassi", ["koumassi", "kouassi", "koumasi", "kumassi"]], ["marcory", ["marcory", "marcori"]], ["port bouet", ["port bouet", "portbouet", "port boue"]]];

/** Commune de la fiche → commune en base (variantes d'écriture tolérées). */
export function communeId(value, communes) {
  const key = norm(value);
  if (!key) return null;
  for (const [canon, variants] of VARIANTES_COMMUNES) {
    if (variants.some((v) => key.includes(v))) return communes.get(canon) ?? null;
  }
  return communes.get(key) ?? null;
}

const titulaire = (r) => norm(`${r.nom ?? ""} ${r.prenoms ?? ""}`);

/** Distance d'édition (Levenshtein) bornée. */
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Noms proches : 1 lettre d'écart (2 au-delà de 10 lettres), ou l'un contient l'autre (prénom ajouté). */
export function proche(a, b) {
  if (a === b) return true;
  if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) return true;
  return distance(a, b, 2) <= (Math.min(a.length, b.length) > 10 ? 2 : 1);
}

/** Doublons exacts entre fiches : la saisie la plus récente est gardée. */
export function dedoublonner(rows) {
  const best = new Map();
  for (const row of rows) {
    const key = [titulaire(row), norm(row.lot), norm(row.ilot), norm(row.libelle), norm(row.tf)].join("|");
    const current = best.get(key);
    if (!current || (row.debut && (!current.debut || row.debut > current.debut))) best.set(key, row);
  }
  return [...best.values()];
}

const CHAMPS = [
  ["codeBarres", "codeBarres"], ["guichet", "numeroGuichet"], ["ddu", "numeroDdu"], ["reference", "referenceClassement"],
  ["ilot", "numeroIlot"], ["lot", "numeroLot"], ["tf", "numeroTitreFoncier"], ["nom", "nom"], ["prenoms", "prenoms"],
  ["adresse", "adresse"], ["telephone", "telephone"], ["email", "email"],
];

function latestDepot(root) {
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root).filter((d) => statSync(path.join(root, d)).isDirectory()).sort();
  return dirs.length ? path.join(root, dirs[dirs.length - 1]) : null;
}

export async function reprendreFiches(db, { dir, apply = false }) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xlsx")).map((f) => path.join(dir, f));
  if (!files.length) throw new Error(`Aucune fiche .xlsx dans ${dir}.`);
  const lues = [];
  for (const file of files) lues.push(...(await readFiche(file)));
  const lignes = dedoublonner(lues);

  const [communesRows, existants, site, operateurs, statuts] = await Promise.all([
    db.commune.findMany({ select: { id: true, nom: true } }),
    db.dossier.findMany({ select: { id: true, nom: true, prenoms: true, numeroLot: true, communeId: true, libelleCarton: true, codeBarres: true, numeroGuichet: true, numeroDdu: true, referenceClassement: true, numeroIlot: true, numeroTitreFoncier: true, adresse: true, telephone: true, email: true, superficie: true } }),
    db.site.findFirst({ where: { nom: { contains: "Plateau" } }, select: { id: true, nom: true, entrepots: { select: { id: true, nom: true, code: true } } } }),
    db.operateur.findMany({ select: { id: true, nom: true, prenoms: true, matricule: true } }),
    db.dossier.groupBy({ by: ["statutCollecte", "statutValidation"], _count: { _all: true }, orderBy: { _count: { id: "desc" } }, take: 1 }),
  ]);
  const communes = new Map(communesRows.map((c) => [norm(c.nom), c.id]));
  const salle = site?.entrepots.find((e) => e.code === "MIN-S01") ?? site?.entrepots[0] ?? null;

  // Rapprochement en plusieurs passes, de la plus sûre à la plus large ; chaque
  // passe ne traite que les lignes encore sans correspondance.
  const index = (keyOf) => {
    const map = new Map();
    for (const d of existants) {
      const key = keyOf(d);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return map;
  };
  const tfKey = (v) => { const digits = String(v ?? "").replace(/\D/g, ""); return digits.length >= 4 ? digits : null; };
  const t = (d) => titulaire(d) || null;
  const passes = [
    ["titulaire + lot + commune", (d) => t(d) && d.numeroLot ? `${t(d)}|${norm(d.numeroLot)}|${d.communeId ?? ""}` : null, (l) => t(l) && l.lot ? `${t(l)}|${norm(l.lot)}|${l.communeId ?? ""}` : null],
    ["titulaire + lot", (d) => t(d) && d.numeroLot ? `${t(d)}|${norm(d.numeroLot)}` : null, (l) => t(l) && l.lot ? `${t(l)}|${norm(l.lot)}` : null],
    ["titulaire + libellé", (d) => t(d) && d.libelleCarton ? `${t(d)}|${norm(d.libelleCarton)}` : null, (l) => t(l) && l.libelle ? `${t(l)}|${norm(l.libelle)}` : null],
    ["titre foncier", (d) => tfKey(d.numeroTitreFoncier), (l) => tfKey(l.tf)],
    ["libellé + îlot + lot", (d) => d.numeroLot && d.libelleCarton ? `${norm(d.libelleCarton)}|${norm(d.numeroIlot)}|${norm(d.numeroLot)}` : null, (l) => l.lot && l.libelle ? `${norm(l.libelle)}|${norm(l.ilot)}|${norm(l.lot)}` : null],
  ];
  const pris = new Set();
  const appariement = new Map();
  const parPasse = {};
  const lignesAvecCommune = lignes.map((ligne) => ({ ...ligne, communeId: communeId(ligne.commune, communes) }));
  for (const [nom, keyDb, keyFiche] of passes) {
    const map = index(keyDb);
    for (const ligne of lignesAvecCommune) {
      if (appariement.has(ligne)) continue;
      const key = keyFiche(ligne);
      const match = key ? (map.get(key) ?? []).find((d) => !pris.has(d.id)) : null;
      if (match) { pris.add(match.id); appariement.set(ligne, match); parPasse[nom] = (parPasse[nom] ?? 0) + 1; }
    }
  }
  // Nom proche (1 à 2 lettres d'écart) au même lot : fautes de frappe corrigées sur le terrain.
  const parLotSeul = index((d) => (d.numeroLot && !pris.has(d.id) ? norm(d.numeroLot) : null));
  for (const ligne of lignesAvecCommune) {
    if (appariement.has(ligne) || !ligne.lot || !t(ligne)) continue;
    const candidats = (parLotSeul.get(norm(ligne.lot)) ?? []).filter((d) => !pris.has(d.id) && t(d) && proche(t(d), t(ligne)));
    if (candidats.length === 1) { pris.add(candidats[0].id); appariement.set(ligne, candidats[0]); parPasse["nom proche + même lot"] = (parPasse["nom proche + même lot"] ?? 0) + 1; }
  }

  const majs = [];
  const nouveaux = [];
  const champsModifies = new Map();
  for (const ligne of lignesAvecCommune) {
    const match = appariement.get(ligne);
    if (!match) { nouveaux.push(ligne); continue; }
    const data = {};
    // Une valeur n'est remplacée que si elle change vraiment (pas une simple différence de casse ou d'espaces).
    for (const [from, to] of CHAMPS) {
      if (ligne[from] != null && norm(ligne[from]) !== norm(match[to])) data[to] = ligne[from];
    }
    if (ligne.superficie != null && Number(match.superficie ?? 0) !== ligne.superficie) data.superficie = ligne.superficie;
    if (ligne.communeId && ligne.communeId !== match.communeId) data.communeId = ligne.communeId;
    for (const key of Object.keys(data)) champsModifies.set(key, (champsModifies.get(key) ?? 0) + 1);
    if (Object.keys(data).length) majs.push({ id: match.id, data });
  }
  const inchanges = lignes.length - majs.length - nouveaux.length;
  const absents = existants.length - pris.size;

  const report = {
    fichiers: files.map((f) => path.basename(f)), lues: lues.length, lignes: lignes.length, doublons: lues.length - lignes.length,
    majs: majs.length, inchanges, nouveaux: nouveaux.length, absents, existants: existants.length,
    champsModifies: [...champsModifies.entries()].sort((a, b) => b[1] - a[1]),
    nouveauxParCommune: Object.entries(nouveaux.reduce((acc, n) => { const c = communesRows.find((x) => x.id === n.communeId)?.nom ?? "sans commune"; acc[c] = (acc[c] ?? 0) + 1; return acc; }, {})),
    nouveauxLibelles: new Set(nouveaux.map((n) => norm(n.libelle))).size,
    site: site?.nom ?? null, salle: salle?.nom ?? null, statut: statuts[0] ?? null,
    parPasse: Object.entries(parPasse),
  };
  if (!apply) return { applied: false, report };
  if (!site) throw new Error("Site ministère - Plateau introuvable.");

  // Opérateur des nouveaux dossiers : l'enquêteur dont le nom figure dans le fichier, sinon la fiche « Reprise terrain ».
  let reprise = operateurs.find((o) => o.matricule === "OP-REPRISE");
  if (!reprise) reprise = await db.operateur.create({ data: { matricule: "OP-REPRISE", nom: "Reprise des fiches terrain", isActive: false } });
  const operateurDe = (fichier) => {
    const key = norm(fichier);
    const found = operateurs.find((o) => [o.nom, o.prenoms].filter(Boolean).some((n) => norm(n).length >= 4 && key.includes(norm(n).split(" ")[0])));
    return found?.id ?? reprise.id;
  };
  const nature = await db.natureDossier.findUnique({ where: { code: "2010" }, select: { id: true } });
  const year = new Date().getFullYear();
  const last = await db.dossier.findFirst({ where: { reference: { startsWith: `DOS-${year}-` } }, orderBy: { reference: "desc" }, select: { reference: true } });
  let sequence = last ? Number(last.reference.slice(`DOS-${year}-`.length)) + 1 : 1;

  // Cartons existants par libellé normalisé sur le site.
  const cartonsParLibelle = new Map();
  for (const row of await db.dossier.findMany({ where: { siteId: site.id, cartonId: { not: null }, libelleCarton: { not: null } }, select: { cartonId: true, libelleCarton: true }, distinct: ["cartonId", "libelleCarton"] })) {
    const key = norm(row.libelleCarton);
    if (!cartonsParLibelle.has(key)) cartonsParLibelle.set(key, row.cartonId);
  }

  let maj = 0;
  for (let i = 0; i < majs.length; i += 500) {
    await db.$transaction(majs.slice(i, i + 500).map((m) => db.dossier.update({ where: { id: m.id }, data: m.data })), { timeout: 300_000 });
    maj += Math.min(500, majs.length - i);
  }

  let crees = 0;
  let cartonsCrees = 0;
  for (let i = 0; i < nouveaux.length; i += 500) {
    const batch = nouveaux.slice(i, i + 500);
    await db.$transaction(async (tx) => {
      for (const n of batch) {
        const key = norm(n.libelle);
        let cartonId = key ? cartonsParLibelle.get(key) : null;
        if (!cartonId) {
          cartonId = (await tx.carton.create({ data: {}, select: { id: true } })).id;
          if (key) cartonsParLibelle.set(key, cartonId);
          cartonsCrees += 1;
        }
        await tx.dossier.create({
          data: {
            reference: `DOS-${year}-${String(sequence++).padStart(6, "0")}`,
            operateurId: operateurDe(n.fichier), cartonId, siteId: site.id, entrepotId: salle?.id ?? null,
            libelleCarton: n.libelle, codeBarres: n.codeBarres, numeroGuichet: n.guichet, numeroDdu: n.ddu, referenceClassement: n.reference,
            numeroIlot: n.ilot, numeroLot: n.lot, superficie: n.superficie, numeroTitreFoncier: n.tf, communeId: n.communeId,
            natureDossierId: nature?.id ?? null, nom: n.nom, prenoms: n.prenoms, adresse: n.adresse, telephone: n.telephone, email: n.email,
            statutCollecte: report.statut?.statutCollecte ?? "SOUMIS", statutValidation: report.statut?.statutValidation ?? "EN_ATTENTE",
            ...(n.debut ? { createdAt: n.debut } : {}),
          },
        });
        crees += 1;
      }
    }, { maxWait: 10_000, timeout: 600_000 });
  }
  // Cotes : cartons neufs cotés, nouveaux dossiers numérotés à la suite (n+1).
  const cotes = await assignCotes(db, { apply: true, nature: false });
  await db.auditLog.create({ data: { action: "REPRISE_FICHES_TERRAIN", entity: "DOSSIER", newValue: { fichiers: report.fichiers, maj, crees, cartonsCrees } } });
  return { applied: true, report, maj, crees, cartonsCrees, cotes };
}

function print(result) {
  const r = result.report;
  console.log(`Fichiers : ${r.fichiers.join(", ")}`);
  console.log(`Lignes lues : ${r.lues} — doublons exacts écartés : ${r.doublons} — dossiers distincts : ${r.lignes}`);
  console.log(`Dossiers en base : ${r.existants}`);
  console.log(`  rapprochements : ${r.parPasse.map(([p, n]) => `${p} ${n}`).join(", ")}`);
  console.log(`  à mettre à jour : ${r.majs}   déjà identiques : ${r.inchanges}   absents des fiches (inchangés) : ${r.absents}`);
  console.log(`  nouveaux dossiers : ${r.nouveaux} (${r.nouveauxLibelles} libellés de carton) → ${r.site} · ${r.salle}`);
  console.log(`  nouveaux par commune : ${r.nouveauxParCommune.map(([c, n]) => `${c} ${n}`).join(", ")}`);
  console.log(`  champs corrigés : ${r.champsModifies.map(([c, n]) => `${c} ${n}`).join(", ") || "aucun"}`);
  console.log(`  statut des nouveaux : ${r.statut?.statutCollecte ?? "SOUMIS"} / ${r.statut?.statutValidation ?? "EN_ATTENTE"}`);
  if (result.applied) console.log(`\nAPPLIQUÉ : ${result.maj} mis à jour, ${result.crees} créés, ${result.cartonsCrees} carton(s) créé(s), cotes : ${result.cotes.cartons} carton(s), ${result.cotes.dossiers} dossier(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dirArg = args.find((a) => a.startsWith("--dir="))?.slice(6);
  const prisma = new PrismaClient();
  try {
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const dir = dirArg ?? latestDepot(DEPOT_ROOT);
    if (!dir) throw new Error("Aucun dépôt de fiches : déposez-les depuis Import > Reprise des fiches terrain.");
    console.log(apply ? "REPRISE APPLIQUÉE :" : "SIMULATION — aucune donnée modifiée.");
    console.log(`Dépôt : ${path.basename(dir)}`);
    print(await reprendreFiches(prisma, { dir, apply }));
  } catch (error) {
    console.error(`Reprise échouée : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
