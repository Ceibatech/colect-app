// Regroupement des cartons par libellé : un libellé = un carton = un CTN.
//
//   node deploy/regroup-cartons.mjs                         → simulation, rien n'est modifié
//   node deploy/regroup-cartons.mjs --apply --confirm=REGROUPER-CARTONS
//   options : --max-dossiers=80  (au-delà, libellé générique laissé tel quel)
//             --csv=/chemin/rapport.csv
//
// Les cartons ont été identifiés à partir du code-barres de chaque dossier, si
// bien qu'un même carton physique porte plusieurs CTN. Le libellé est la seule
// identification fiable : les dossiers de même libellé (casse, accents,
// ponctuation, espaces et ordinaux ignorés), dans le même site — quelle que
// soit la salle saisie — sont regroupés dans le plus ancien CTN du groupe, et
// rangés dans la salle où se trouve la majorité de ses dossiers. C'est ce CTN qui sera
// imprimé en QR code sur le carton.
//
// Ne sont PAS regroupés (listés dans le rapport) :
//   - les libellés génériques portés par plus de --max-dossiers dossiers
//     (un nom de lotissement ou de titulaire couvrant plusieurs cartons) ;
//   - les groupes dont un carton est engagé dans un transfert ouvert ;
//   - les dossiers sans libellé.
// Les fautes de frappe (« Anna » / « Anan ») ne sont pas fusionnées.
//
// Effets en mode --apply, dans une seule transaction : dossiers déplacés vers
// le CTN conservé, une ligne d'historique par dossier déplacé, suppression des
// cartons vidés sans historique de transfert, une ligne d'audit
// CARTON_REGROUP. Le script de déploiement sauvegarde la base avant --apply.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const CONFIRMATION = "REGROUPER-CARTONS";
const DEFAULT_MAX_DOSSIERS = 80;

/** Copie de normalizeCartonLabel (src/lib/cartons/identity-normalization.ts) ; un test vérifie qu'elles concordent. */
export function labelKey(value) {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/(\d+)(?:\s*(?:eme|ere)|er|e)(?![\p{L}\p{N}])/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return normalized || null;
}

/** Même clé d'admission v3 que buildCartonLegacyKey (src/lib/cartons/persistence.ts). */
export function legacyKey(siteId, key) {
  const hex = Buffer.from(key, "utf8").toString("hex").toUpperCase();
  return createHash("sha256").update(`v4:${siteId ?? "~"}:label:${hex}`).digest("hex");
}

const ctn = (id) => `CTN-${String(id).padStart(8, "0")}`;
const tidy = (text) => (text ?? "").replace(/\s+/g, " ").trim();

/** Plan de regroupement, calculé en mémoire à partir des dossiers. */
export function planRegroup(dossiers, { maxDossiers = DEFAULT_MAX_DOSSIERS, engagedCartonIds = new Set() } = {}) {
  const groups = new Map();
  let withoutLabel = 0;
  for (const d of dossiers) {
    if (d.cartonId == null) continue;
    const key = labelKey(d.libelleCarton);
    if (!key) { withoutLabel++; continue; }
    const id = `${d.siteId ?? "-"}|${key}`;
    const group = groups.get(id) ?? { siteId: d.siteId, key, labels: new Map(), cartons: new Map(), salles: new Map(), dossierSalles: new Map(), dossiers: 0 };
    group.dossiers++;
    group.salles.set(d.entrepotId ?? null, (group.salles.get(d.entrepotId ?? null) ?? 0) + 1);
    group.dossierSalles.set(d.id, d.entrepotId ?? null);
    const label = tidy(d.libelleCarton);
    group.labels.set(label, (group.labels.get(label) ?? 0) + 1);
    const members = group.cartons.get(d.cartonId) ?? [];
    members.push(d.id);
    group.cartons.set(d.cartonId, members);
    groups.set(id, group);
  }
  const merges = [];
  const generic = [];
  const blocked = [];
  for (const group of groups.values()) {
    if (group.cartons.size < 2 && group.salles.size < 2) continue;
    const label = [...group.labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // Un carton est rangé dans une seule salle : celle où se trouve la majorité de ses dossiers.
    const entrepotId = [...group.salles.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const relocate = [...group.dossierSalles.entries()].filter(([, salle]) => salle !== entrepotId).map(([dossierId]) => dossierId);
    const summary = { siteId: group.siteId, entrepotId, key: group.key, label, variants: [...group.labels.keys()], dossiers: group.dossiers, cartons: group.cartons.size, salles: group.salles.size, relocate };
    if (group.dossiers > maxDossiers) { generic.push(summary); continue; }
    const ids = [...group.cartons.keys()].sort((a, b) => a - b);
    if (ids.some((id) => engagedCartonIds.has(id))) { blocked.push(summary); continue; }
    const target = ids[0];
    const moves = ids.slice(1).map((from) => ({ from, dossierIds: group.cartons.get(from) }));
    merges.push({ ...summary, target, moves });
  }
  const cartonsBefore = new Set(dossiers.filter((d) => d.cartonId != null).map((d) => d.cartonId)).size;
  const removed = merges.reduce((sum, m) => sum + m.moves.length, 0);
  return {
    merges, generic, blocked, withoutLabel,
    cartonsBefore,
    cartonsAfter: cartonsBefore - removed,
    dossiersMoved: merges.reduce((sum, m) => sum + m.moves.reduce((s, move) => s + move.dossierIds.length, 0), 0),
    dossiersRelocated: merges.reduce((sum, m) => sum + m.relocate.length, 0),
  };
}

async function loadPlan(db, options) {
  const dossiers = await db.dossier.findMany({
    where: { cartonId: { not: null } },
    select: { id: true, cartonId: true, siteId: true, entrepotId: true, libelleCarton: true },
  });
  const engaged = await db.transferLotItem.findMany({
    where: { cartonId: { not: null }, status: { in: ["PREVU", "SORTI", "RECU"] }, transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } } },
    select: { cartonId: true },
  });
  return planRegroup(dossiers, { ...options, engagedCartonIds: new Set(engaged.map((row) => row.cartonId)) });
}

export async function regroupCartons(db, { apply = false, maxDossiers = DEFAULT_MAX_DOSSIERS } = {}) {
  const plan = await loadPlan(db, { maxDossiers });
  if (!apply) return { applied: false, plan };

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRawUnsafe("SELECT id FROM cartons FOR UPDATE");
    // Recalcul sous verrou : aucune saisie ne s'intercale entre le plan et l'écriture.
    const locked = await loadPlan(tx, { maxDossiers });
    // Écritures groupées : quelques centaines de requêtes au lieu de plusieurs milliers.
    let moved = 0;
    const history = [];
    const allFromIds = locked.merges.flatMap((merge) => merge.moves.map((move) => move.from));
    const keys = locked.merges.map((merge) => ({ id: merge.target, key: legacyKey(merge.siteId, merge.key) }));
    // Libère les clés d'admission avant de les réattribuer aux CTN conservés.
    for (let i = 0; i < allFromIds.length; i += 1000) {
      await tx.carton.updateMany({ where: { id: { in: allFromIds.slice(i, i + 1000) } }, data: { legacyKey: null } });
    }
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      await tx.carton.updateMany({ where: { legacyKey: { in: chunk.map((k) => k.key) } }, data: { legacyKey: null } });
    }
    for (const merge of locked.merges) {
      const dossierIds = merge.moves.flatMap((move) => move.dossierIds);
      if (dossierIds.length) {
        const count = await tx.dossier.updateMany({ where: { id: { in: dossierIds }, cartonId: { in: merge.moves.map((move) => move.from) } }, data: { cartonId: merge.target } });
        moved += count.count;
      }
      for (const move of merge.moves) {
        for (const dossierId of move.dossierIds) history.push({
          dossierId,
          action: "CARTON_REGROUPEMENT",
          commentaire: `Carton ${ctn(move.from)} regroupé dans ${ctn(merge.target)} (libellé « ${merge.label} »).`,
          metadata: { from: move.from, to: merge.target, key: merge.key },
        });
      }
      if (merge.relocate.length) {
        await tx.dossier.updateMany({ where: { id: { in: merge.relocate } }, data: { entrepotId: merge.entrepotId } });
        for (const dossierId of merge.relocate) history.push({
          dossierId,
          action: "CARTON_REGROUPEMENT_SALLE",
          commentaire: `Salle alignée sur celle du carton ${ctn(merge.target)} (libellé « ${merge.label} »).`,
          metadata: { cartonId: merge.target, entrepotId: merge.entrepotId },
        });
      }
    }
    for (const { id, key } of keys) await tx.carton.update({ where: { id }, data: { legacyKey: key } });
    for (let i = 0; i < history.length; i += 2000) await tx.dossierHistory.createMany({ data: history.slice(i, i + 2000) });
    let deleted = 0;
    for (let i = 0; i < allFromIds.length; i += 1000) {
      const ids = allFromIds.slice(i, i + 1000).map(Number);
      deleted += await tx.$executeRawUnsafe(
        `DELETE c FROM cartons c
         LEFT JOIN dossiers d ON d.carton_id = c.id
         LEFT JOIN transfer_lot_items t ON t.carton_id = c.id
         WHERE c.id IN (${ids.join(",")}) AND d.id IS NULL AND t.id IS NULL`,
      );
    }
    await tx.auditLog.create({
      data: {
        action: "CARTON_REGROUP",
        entity: "CARTON",
        newValue: {
          groups: locked.merges.length, dossiersMoved: moved, cartonsDeleted: deleted,
          cartonsBefore: locked.cartonsBefore, cartonsAfter: locked.cartonsAfter, maxDossiers,
          genericLeft: locked.generic.length, blocked: locked.blocked.length,
        },
      },
    });
    return { moved, deleted, plan: locked };
  }, { maxWait: 10_000, timeout: 900_000 });
  return { applied: true, ...result };
}

function place(siteNames, entrepotNames, row) {
  return [siteNames.get(row.siteId) ?? "Sans site", row.entrepotId ? entrepotNames.get(row.entrepotId) ?? `salle ${row.entrepotId}` : "sans salle"].join(" / ");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function printReport(db, plan, csvPath, log = console.log) {
  const [sites, entrepots] = await Promise.all([
    db.site.findMany({ select: { id: true, nom: true } }),
    db.entrepot.findMany({ select: { id: true, nom: true } }),
  ]);
  const siteNames = new Map(sites.map((s) => [s.id, s.nom]));
  const entrepotNames = new Map(entrepots.map((e) => [e.id, e.nom]));
  log(`  Cartons (CTN) : ${plan.cartonsBefore} → ${plan.cartonsAfter} après regroupement`);
  log(`  Libellés regroupés : ${plan.merges.length} — dossiers rattachés à un autre CTN : ${plan.dossiersMoved} — dossiers dont la salle est alignée : ${plan.dossiersRelocated}`);
  log(`  Libellés génériques laissés tels quels (plus de dossiers que le seuil) : ${plan.generic.length}`);
  log(`  Groupes bloqués par un transfert ouvert : ${plan.blocked.length}`);
  log(`  Dossiers sans libellé de carton : ${plan.withoutLabel}`);
  const biggest = [...plan.merges].sort((a, b) => b.cartons - a.cartons).slice(0, 15);
  if (biggest.length) {
    log("\n  Exemples (les plus fragmentés) :");
    for (const m of biggest) log(`   - ${place(siteNames, entrepotNames, m)} · « ${m.label} » : ${m.cartons} CTN → ${ctn(m.target)} (${m.dossiers} dossiers)${m.variants.length > 1 ? ` — variantes : ${m.variants.slice(0, 4).join(" | ")}` : ""}`);
  }
  if (plan.generic.length) {
    log("\n  Libellés génériques à vérifier sur le terrain :");
    for (const g of [...plan.generic].sort((a, b) => b.dossiers - a.dossiers).slice(0, 20)) log(`   - ${place(siteNames, entrepotNames, g)} · « ${g.label} » : ${g.dossiers} dossiers, ${g.cartons} CTN`);
  }
  if (csvPath) {
    const lines = [["action", "site_salle", "libelle", "variantes", "dossiers", "ctn_actuels", "ctn_conserve"].join(";")];
    for (const m of plan.merges) lines.push(["regroupe", place(siteNames, entrepotNames, m), m.label, m.variants.join(" | "), m.dossiers, m.cartons, ctn(m.target)].map(csvCell).join(";"));
    for (const g of plan.generic) lines.push(["generique_a_verifier", place(siteNames, entrepotNames, g), g.label, g.variants.join(" | "), g.dossiers, g.cartons, ""].map(csvCell).join(";"));
    for (const b of plan.blocked) lines.push(["bloque_transfert", place(siteNames, entrepotNames, b), b.label, b.variants.join(" | "), b.dossiers, b.cartons, ""].map(csvCell).join(";"));
    const csv = `\uFEFF${lines.join("\n")}\n`;
    if (csvPath === "-") process.stdout.write(csv);
    else {
      writeFileSync(csvPath, csv);
      log(`\n  Rapport détaillé : ${csvPath}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const maxArg = args.find((arg) => arg.startsWith("--max-dossiers="));
  const csvArg = args.find((arg) => arg.startsWith("--csv="));
  const maxDossiers = maxArg ? Number(maxArg.split("=")[1]) : DEFAULT_MAX_DOSSIERS;
  const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--confirm=") && arg !== maxArg && arg !== csvArg);
  const prisma = new PrismaClient();
  try {
    if (unknown.length) throw new Error(`Arguments inconnus : ${unknown.join(" ")}`);
    if (!Number.isInteger(maxDossiers) || maxDossiers < 2) throw new Error("--max-dossiers doit être un entier ≥ 2.");
    if (apply && !args.includes(`--confirm=${CONFIRMATION}`)) throw new Error(`--apply exige --confirm=${CONFIRMATION}`);
    const result = await regroupCartons(prisma, { apply, maxDossiers });
    const csvPath = csvArg?.slice("--csv=".length);
    // CSV sur stdout (--csv=-) : le résumé passe sur stderr.
    const log = csvPath === "-" ? console.error : console.log;
    log(apply ? "REGROUPEMENT APPLIQUÉ :" : "SIMULATION — aucune donnée modifiée. Le regroupement ferait :");
    await printReport(prisma, result.plan, csvPath, log);
    if (result.applied) log(`\n  ${result.moved} dossier(s) déplacé(s), ${result.deleted} carton(s) vide(s) supprimé(s).`);
  } catch (error) {
    console.error(`Regroupement des cartons échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
