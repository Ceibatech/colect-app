/**
 * Seed de PRODUCTION — Phase 15 (§95/§96), à la différence de `seed.ts`
 * (données 100% fictives, dev/staging uniquement, cf. son en-tête).
 *
 * Ne charge QUE la structure applicative fixe, jamais de donnée métier
 * inventée (cahier des charges §37/§79) :
 *   - rôles (ADMIN/SUPERVISEUR/OPERATEUR/CONSULTATION)
 *   - permissions + leur association aux rôles (matrice RBAC — source unique
 *     de vérité : src/lib/permissions/constants.ts)
 *   - statuts de workflow (BROUILLON/SOUMIS/EN_CONTROLE/... — états fixes du
 *     cycle métier, pas des données saisies)
 *   - le paramètre APP_NAME
 *
 * Ne crée AUCUN utilisateur, AUCUNE commune/lotissement/nature de dossier,
 * AUCUN dossier — ces données sont réelles et propres à l'organisation,
 * jamais inventées par ce script. Idempotent (upsert) : peut être relancé
 * sans dupliquer.
 *
 * Usage : DATABASE_URL=... npx tsx prisma/seed-production-core.ts
 */
import { PrismaClient, WorkflowType } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/permissions/constants";

const prisma = new PrismaClient();

const ROLES = [
  { code: "ADMIN", name: "Administrateur", description: "Accès complet à l'application." },
  { code: "SUPERVISEUR", name: "Superviseur", description: "Contrôle, validation, rejet, supervision, dashboard, export." },
  { code: "OPERATEUR", name: "Opérateur", description: "Création et modification de ses dossiers, collecte, soumission." },
  { code: "CONSULTATION", name: "Consultation", description: "Consultation, recherche, dashboard uniquement." },
];

const WORKFLOW_STATUSES: Array<{ workflowType: WorkflowType; code: string; libelle: string; ordre: number; isFinal: boolean }> = [
  { workflowType: "COLLECTE", code: "BROUILLON", libelle: "Brouillon", ordre: 1, isFinal: false },
  { workflowType: "COLLECTE", code: "SOUMIS", libelle: "Soumis", ordre: 2, isFinal: true },

  { workflowType: "VALIDATION", code: "EN_ATTENTE", libelle: "En attente", ordre: 1, isFinal: false },
  { workflowType: "VALIDATION", code: "EN_CONTROLE", libelle: "En contrôle", ordre: 2, isFinal: false },
  { workflowType: "VALIDATION", code: "VALIDE", libelle: "Validé", ordre: 3, isFinal: true },
  { workflowType: "VALIDATION", code: "REJETE", libelle: "Rejeté", ordre: 3, isFinal: true },

  { workflowType: "NUMERISATION", code: "EN_ATTENTE", libelle: "En attente", ordre: 1, isFinal: false },
  { workflowType: "NUMERISATION", code: "EN_COURS", libelle: "En cours", ordre: 2, isFinal: false },
  { workflowType: "NUMERISATION", code: "TERMINE", libelle: "Terminé", ordre: 3, isFinal: true },

  { workflowType: "INDEXATION", code: "EN_ATTENTE", libelle: "En attente", ordre: 1, isFinal: false },
  { workflowType: "INDEXATION", code: "EN_COURS", libelle: "En cours", ordre: 2, isFinal: false },
  { workflowType: "INDEXATION", code: "TERMINE", libelle: "Terminé", ordre: 3, isFinal: true },

  { workflowType: "ARCHIVAGE", code: "EN_ATTENTE", libelle: "En attente", ordre: 1, isFinal: false },
  { workflowType: "ARCHIVAGE", code: "EN_COURS", libelle: "En cours", ordre: 2, isFinal: false },
  { workflowType: "ARCHIVAGE", code: "TERMINE", libelle: "Terminé", ordre: 3, isFinal: true },
];

async function main() {
  console.log("Seed production (structure applicative uniquement, aucune donnée métier) — démarrage\n");

  const roleByCode: Record<string, number> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({ where: { code: r.code }, update: {}, create: r });
    roleByCode[r.code] = role.id;
  }
  console.log(`✔ ${ROLES.length} rôles`);

  const permByCode: Record<string, number> = {};
  for (const code of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, name: code.replace(/_/g, " ").toLowerCase() },
    });
    permByCode[code] = perm.id;
  }
  console.log(`✔ ${PERMISSIONS.length} permissions`);

  for (const [roleCode, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permCode of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: roleByCode[roleCode], permissionId: permByCode[permCode] } },
        update: {},
        create: { roleId: roleByCode[roleCode], permissionId: permByCode[permCode] },
      });
    }
  }
  console.log("✔ role_permissions assignées");

  for (const ws of WORKFLOW_STATUSES) {
    await prisma.workflowStatus.upsert({
      where: { workflowType_code: { workflowType: ws.workflowType, code: ws.code } },
      update: {},
      create: ws,
    });
  }
  console.log(`✔ ${WORKFLOW_STATUSES.length} statuts de workflow`);

  await prisma.setting.upsert({
    where: { key: "APP_NAME" },
    update: {},
    create: { key: "APP_NAME", value: "GeoArchives-MULCV — Numérisation & Indexation", isPublic: true },
  });
  console.log("✔ paramètre APP_NAME");

  console.log("\nSeed production terminé. Aucun utilisateur, commune, lotissement, nature de");
  console.log("dossier ou dossier créé — à ajouter séparément avec les données réelles.");
}

main()
  .catch((e) => {
    console.error("Erreur durant le seed production :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
