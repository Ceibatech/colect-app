/**
 * npm run db:verify
 *
 * Vérifie que la base de données est correctement provisionnée :
 * - connexion
 * - présence des tables attendues
 * - données de référence (rôles, permissions, communes, natures, statuts)
 * - présence du seed (utilisateurs de démonstration)
 * - exécution des requêtes principales utilisées par le dashboard
 *
 * Affiche un rapport clair avec code de sortie non-nul en cas d'échec,
 * pour pouvoir être utilisé en CI.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CheckResult = { label: string; ok: boolean; detail?: string };
const results: CheckResult[] = [];

async function check(label: string, fn: () => Promise<boolean | string>) {
  try {
    const r = await fn();
    if (typeof r === "string") {
      results.push({ label, ok: true, detail: r });
    } else {
      results.push({ label, ok: r });
    }
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ label, ok: false, detail });
  }
}

const EXPECTED_TABLES = [
  "roles", "permissions", "role_permissions",
  "users", "operateurs",
  "communes", "lotissements", "natures_dossier",
  "workflow_statuses", "workflow_transitions", "dossier_history",
  "dossiers",
  "documents", "numerisations", "indexations", "archivages",
  "quality_checks", "anomalies",
  "imports", "exports",
  "audit_logs", "notifications", "settings",
];

async function main() {
  console.log("=== db:verify — STATUT ARCHIVAGE MBPE-CABINET ===\n");

  await check("Connexion à la base", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  });

  await check("Requête simple (COUNT dossiers)", async () => {
    const n = await prisma.dossier.count();
    return `${n} dossiers en base`;
  });

  await check(`Tables attendues présentes (${EXPECTED_TABLES.length})`, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
    );
    const present = new Set(rows.map((r) => r.TABLE_NAME));
    const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      throw new Error(`Tables manquantes : ${missing.join(", ")}`);
    }
    return `${EXPECTED_TABLES.length}/${EXPECTED_TABLES.length} tables trouvées`;
  });

  await check("Index sur dossiers.reference / code_barres", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ Key_name: string }>>(
      `SHOW INDEX FROM dossiers`
    );
    const idx = new Set(rows.map((r) => r.Key_name));
    const hasRef = [...idx].some((k) => k.toLowerCase().includes("reference"));
    return hasRef ? "index détectés" : "aucun index nommé 'reference' détecté (vérifier manuellement)";
  });

  await check("Référentiel rôles (4 attendus)", async () => {
    const n = await prisma.role.count();
    if (n < 4) throw new Error(`seulement ${n} rôle(s) trouvé(s), 4 attendus (ADMIN/SUPERVISEUR/OPERATEUR/CONSULTATION)`);
    return `${n} rôles`;
  });

  await check("Référentiel permissions (>= 20 attendues)", async () => {
    const n = await prisma.permission.count();
    if (n < 20) throw new Error(`seulement ${n} permission(s) trouvée(s)`);
    return `${n} permissions`;
  });

  await check("role_permissions non vide", async () => {
    const n = await prisma.rolePermission.count();
    if (n === 0) throw new Error("aucune association role_permissions");
    return `${n} associations`;
  });

  await check("Utilisateurs de démonstration (seed)", async () => {
    const n = await prisma.user.count();
    if (n < 6) throw new Error(`seulement ${n} utilisateur(s), 6 attendus après seed`);
    return `${n} utilisateurs`;
  });

  await check("Communes / lotissements / natures de dossier", async () => {
    const [c, l, n] = await Promise.all([
      prisma.commune.count(),
      prisma.lotissement.count(),
      prisma.natureDossier.count(),
    ]);
    if (c === 0 || l === 0 || n === 0) throw new Error(`communes=${c} lotissements=${l} natures=${n}`);
    return `communes=${c} lotissements=${l} natures=${n}`;
  });

  await check("Statuts de workflow (référentiel)", async () => {
    const n = await prisma.workflowStatus.count();
    if (n === 0) throw new Error("aucun statut de workflow configuré");
    return `${n} statuts configurés`;
  });

  await check("Requête dashboard — KPI globaux", async () => {
    const [total, archives, valides, rejetes] = await Promise.all([
      prisma.dossier.count(),
      prisma.dossier.count({ where: { statutArchivage: "TERMINE" } }),
      prisma.dossier.count({ where: { statutValidation: "VALIDE" } }),
      prisma.dossier.count({ where: { statutValidation: "REJETE" } }),
    ]);
    return `total=${total} archivés=${archives} validés=${valides} rejetés=${rejetes}`;
  });

  await check("Requête dashboard — répartition par commune", async () => {
    const rows = await prisma.dossier.groupBy({ by: ["communeId"], _count: { _all: true } });
    return `${rows.length} groupes commune`;
  });

  await check("Requête dashboard — répartition par opérateur", async () => {
    const rows = await prisma.dossier.groupBy({ by: ["operateurId"], _count: { _all: true } });
    return `${rows.length} groupes opérateur`;
  });

  await check("Intégrité référentielle — dossiers orphelins (operateur)", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) as cnt FROM dossiers d LEFT JOIN operateurs o ON d.operateur_id = o.id WHERE o.id IS NULL`
    );
    const cnt = Number(rows[0]?.cnt ?? 0);
    if (cnt > 0) throw new Error(`${cnt} dossier(s) sans opérateur valide`);
    return "aucun orphelin";
  });

  console.log("");
  let hasFailure = false;
  for (const r of results) {
    const icon = r.ok ? "✔" : "✘";
    console.log(`${icon} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    if (!r.ok) hasFailure = true;
  }

  console.log("\n" + "=".repeat(50));
  if (hasFailure) {
    console.log("RÉSULTAT : ÉCHEC — voir les points ✘ ci-dessus.");
  } else {
    console.log("RÉSULTAT : BASE VALIDE — toutes les vérifications sont passées.");
  }
  console.log("=".repeat(50));

  await prisma.$disconnect();
  process.exit(hasFailure ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Erreur fatale db:verify :", e);
  await prisma.$disconnect();
  process.exit(1);
});
