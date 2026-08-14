/**
 * Seed de démonstration — TOUTES les données ci-dessous sont FICTIVES.
 * Aucune donnée métier réelle n'est utilisée (voir cahier des charges §37/§79).
 * Ne jamais exécuter ce script sur une base de production contenant des
 * données réelles sans revalidation complète.
 */
import { PrismaClient, WorkflowType } from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/lib/permissions/constants";

const prisma = new PrismaClient();

faker.seed(20260813); // reproductibilité

const DEMO_PASSWORD = "Demo@2026!"; // Identifiants de démonstration uniquement — à ne jamais réutiliser en production.

// ----------------------------------------------------------------
// Référentiels statiques
// ----------------------------------------------------------------

const ROLES = [
  { code: "ADMIN", name: "Administrateur", description: "Accès complet à l'application." },
  { code: "SUPERVISEUR", name: "Superviseur", description: "Contrôle, validation, rejet, supervision, dashboard, export." },
  { code: "OPERATEUR", name: "Opérateur", description: "Création et modification de ses dossiers, collecte, soumission." },
  { code: "CONSULTATION", name: "Consultation", description: "Consultation, recherche, dashboard uniquement." },
];

// PERMISSIONS et ROLE_PERMISSIONS importés depuis src/lib/permissions/constants.ts
// (source unique de vérité, réutilisée par l'application pour les contrôles serveur).

// Communes / lotissements fictifs — codes et noms génériques de démonstration.
const COMMUNES = [
  { code: "COM-01", nom: "Commune Démo Nord" },
  { code: "COM-02", nom: "Commune Démo Sud" },
  { code: "COM-03", nom: "Commune Démo Est" },
  { code: "COM-04", nom: "Commune Démo Ouest" },
  { code: "COM-05", nom: "Commune Démo Centre" },
];

const NATURES_DOSSIER = [
  { code: "NAT-TF", libelle: "Titre foncier" },
  { code: "NAT-AV", libelle: "Attestation villageoise" },
  { code: "NAT-LA", libelle: "Lettre d'attribution" },
  { code: "NAT-CP", libelle: "Certificat de propriété" },
  { code: "NAT-AU", libelle: "Autre" },
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
  console.log("Seed — démarrage (données fictives uniquement)\n");

  // 1. Rôles
  const roleByCode: Record<string, number> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
    roleByCode[r.code] = role.id;
  }
  console.log(`✔ ${ROLES.length} rôles`);

  // 2. Permissions
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

  // 3. Role <-> Permissions
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

  // 4. Utilisateurs de démonstration
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@mulcv-demo.local" },
    update: {},
    create: { name: "Admin Démo", email: "admin@mulcv-demo.local", passwordHash, roleId: roleByCode.ADMIN },
  });

  const superviseur = await prisma.user.upsert({
    where: { email: "superviseur@mulcv-demo.local" },
    update: {},
    create: { name: "Superviseur Démo", email: "superviseur@mulcv-demo.local", passwordHash, roleId: roleByCode.SUPERVISEUR },
  });

  await prisma.user.upsert({
    where: { email: "consultation@mulcv-demo.local" },
    update: {},
    create: { name: "Consultation Démo", email: "consultation@mulcv-demo.local", passwordHash, roleId: roleByCode.CONSULTATION },
  });

  const operateurUsers = [];
  for (let i = 1; i <= 3; i++) {
    const u = await prisma.user.upsert({
      where: { email: `operateur${i}@mulcv-demo.local` },
      update: {},
      create: { name: `Opérateur Démo ${i}`, email: `operateur${i}@mulcv-demo.local`, passwordHash, roleId: roleByCode.OPERATEUR },
    });
    operateurUsers.push(u);
  }
  console.log(`✔ ${3 + operateurUsers.length} utilisateurs (admin, superviseur, consultation, ${operateurUsers.length} opérateurs)`);

  // 5. Fiches opérateur
  const operateurs = [];
  for (let i = 0; i < operateurUsers.length; i++) {
    const op = await prisma.operateur.upsert({
      where: { matricule: `OP-${String(i + 1).padStart(3, "0")}` },
      update: {},
      create: {
        userId: operateurUsers[i].id,
        matricule: `OP-${String(i + 1).padStart(3, "0")}`,
        nom: operateurUsers[i].name,
        telephone: faker.phone.number({ style: "international" }),
        email: operateurUsers[i].email,
        isActive: true,
      },
    });
    operateurs.push(op);
  }
  console.log(`✔ ${operateurs.length} fiches opérateur`);

  // 6. Communes / lotissements
  const communes = [];
  for (const c of COMMUNES) {
    const commune = await prisma.commune.upsert({ where: { code: c.code }, update: {}, create: c });
    communes.push(commune);
    for (let i = 1; i <= 2; i++) {
      const lotCode = `${c.code}-LOT-${i}`;
      await prisma.lotissement.upsert({
        where: { code: lotCode },
        update: {},
        create: { communeId: commune.id, code: lotCode, nom: `Lotissement Démo ${c.nom} ${i}` },
      });
    }
  }
  const lotissements = await prisma.lotissement.findMany();
  console.log(`✔ ${communes.length} communes / ${lotissements.length} lotissements`);

  // 7. Natures de dossier
  const natures = [];
  for (const n of NATURES_DOSSIER) {
    const nat = await prisma.natureDossier.upsert({ where: { code: n.code }, update: {}, create: n });
    natures.push(nat);
  }
  console.log(`✔ ${natures.length} natures de dossier`);

  // 8. Statuts de workflow (référentiel de configuration)
  for (const ws of WORKFLOW_STATUSES) {
    await prisma.workflowStatus.upsert({
      where: { workflowType_code: { workflowType: ws.workflowType, code: ws.code } },
      update: {},
      create: ws,
    });
  }
  console.log(`✔ ${WORKFLOW_STATUSES.length} statuts de workflow`);

  // 9. Paramètres applicatifs
  await prisma.setting.upsert({
    where: { key: "APP_NAME" },
    update: {},
    create: { key: "APP_NAME", value: "GeoArchives-MULCV — Numérisation & Indexation", isPublic: true },
  });

  // 10. Dossiers fictifs + cycle de vie
  const TOTAL_DOSSIERS = 300;
  const startDate = new Date("2026-01-01T00:00:00Z");
  const endDate = new Date("2026-08-13T00:00:00Z");

  let seq = 1;
  console.log(`… génération de ${TOTAL_DOSSIERS} dossiers fictifs (peut prendre quelques minutes)`);

  for (let i = 0; i < TOTAL_DOSSIERS; i++) {
    const createdAt = faker.date.between({ from: startDate, to: endDate });
    const operateur = faker.helpers.arrayElement(operateurs);
    const commune = faker.helpers.arrayElement(communes);
    const communeLots = lotissements.filter((l) => l.communeId === commune.id);
    const lotissement = faker.helpers.arrayElement(communeLots);
    const nature = faker.helpers.arrayElement(natures);

    // Distribution volontairement pondérée pour peupler tout le pipeline (KPI/dashboard réalistes)
    const stageRoll = faker.number.int({ min: 1, max: 100 });
    let stage: "BROUILLON" | "SOUMIS" | "REJETE" | "VALIDE" | "NUMERISE" | "INDEXE" | "ARCHIVE";
    if (stageRoll <= 8) stage = "BROUILLON";
    else if (stageRoll <= 18) stage = "SOUMIS";
    else if (stageRoll <= 26) stage = "REJETE";
    else if (stageRoll <= 38) stage = "VALIDE";
    else if (stageRoll <= 55) stage = "NUMERISE";
    else if (stageRoll <= 75) stage = "INDEXE";
    else stage = "ARCHIVE";

    const reference = `DOS-2026-${String(seq).padStart(6, "0")}`;
    seq++;

    const dateSoumission = stage === "BROUILLON" ? null : faker.date.soon({ days: 2, refDate: createdAt });
    const dateValidation =
      stage === "REJETE" || stage === "VALIDE" || stage === "NUMERISE" || stage === "INDEXE" || stage === "ARCHIVE"
        ? faker.date.soon({ days: 3, refDate: dateSoumission ?? createdAt })
        : null;
    const dateNumerisation =
      stage === "NUMERISE" || stage === "INDEXE" || stage === "ARCHIVE"
        ? faker.date.soon({ days: 5, refDate: dateValidation ?? createdAt })
        : null;
    const dateIndexation =
      stage === "INDEXE" || stage === "ARCHIVE" ? faker.date.soon({ days: 4, refDate: dateNumerisation ?? createdAt }) : null;
    const dateArchivage = stage === "ARCHIVE" ? faker.date.soon({ days: 6, refDate: dateIndexation ?? createdAt }) : null;

    const dossier = await prisma.dossier.create({
      data: {
        reference,
        operateurId: operateur.id,
        libelleCarton: `Carton ${faker.string.alphanumeric(6).toUpperCase()}`,
        codeBarres: faker.string.numeric(13),
        numeroGuichet: faker.string.numeric(6),
        numeroDdu: `DDU-${faker.string.numeric(8)}`,
        referenceClassement: `CLA-${faker.string.alphanumeric(8).toUpperCase()}`,
        numeroIlot: faker.string.numeric(3),
        numeroLot: faker.string.numeric(3),
        superficie: faker.number.float({ min: 100, max: 5000, fractionDigits: 2 }),
        numeroTitreFoncier: `TF-${faker.string.numeric(7)}`,
        communeId: commune.id,
        lotissementId: lotissement.id,
        natureDossierId: nature.id,
        nom: faker.person.lastName(),
        prenoms: faker.person.firstName(),
        adresse: faker.location.streetAddress(),
        telephone: faker.phone.number({ style: "international" }),
        email: faker.internet.email().toLowerCase(),
        personneContact: faker.person.fullName(),
        mobile: faker.phone.number({ style: "international" }),

        statutCollecte: stage === "BROUILLON" ? "BROUILLON" : "SOUMIS",
        statutValidation:
          stage === "BROUILLON" || stage === "SOUMIS"
            ? "EN_ATTENTE"
            : stage === "REJETE"
              ? "REJETE"
              : "VALIDE",
        statutNumerisation:
          stage === "NUMERISE" || stage === "INDEXE" || stage === "ARCHIVE" ? "TERMINE" : "EN_ATTENTE",
        statutIndexation: stage === "INDEXE" || stage === "ARCHIVE" ? "TERMINE" : "EN_ATTENTE",
        statutArchivage: stage === "ARCHIVE" ? "TERMINE" : "EN_ATTENTE",

        dateSoumission,
        dateValidation,
        dateNumerisation,
        dateIndexation,
        dateArchivage,

        nombrePages: faker.number.int({ min: 3, max: 80 }),
        observations: faker.datatype.boolean({ probability: 0.2 }) ? faker.lorem.sentence() : null,

        createdAt,
        updatedAt: dateArchivage ?? dateIndexation ?? dateNumerisation ?? dateValidation ?? dateSoumission ?? createdAt,
      },
    });

    // Historique minimal cohérent avec le stade atteint
    await prisma.dossierHistory.create({
      data: {
        dossierId: dossier.id,
        userId: operateur.userId,
        action: "CREATION",
        nouveauStatut: "BROUILLON",
        createdAt,
      },
    });
    if (dateSoumission) {
      await prisma.dossierHistory.create({
        data: { dossierId: dossier.id, userId: operateur.userId, action: "SOUMISSION", ancienStatut: "BROUILLON", nouveauStatut: "SOUMIS", createdAt: dateSoumission },
      });
      await prisma.workflowTransition.create({
        data: { dossierId: dossier.id, workflowType: "COLLECTE", fromStatus: "BROUILLON", toStatus: "SOUMIS", userId: operateur.userId, createdAt: dateSoumission },
      });
    }
    if (dateValidation) {
      const finalStatut = stage === "REJETE" ? "REJETE" : "VALIDE";
      await prisma.dossierHistory.create({
        data: { dossierId: dossier.id, userId: superviseur.id, action: finalStatut, ancienStatut: "EN_CONTROLE", nouveauStatut: finalStatut, createdAt: dateValidation },
      });
      await prisma.workflowTransition.create({
        data: { dossierId: dossier.id, workflowType: "VALIDATION", fromStatus: "EN_CONTROLE", toStatus: finalStatut, userId: superviseur.id, createdAt: dateValidation },
      });
    }

    // Numérisation / Indexation / Archivage
    if (dateNumerisation) {
      await prisma.numerisation.create({
        data: {
          dossierId: dossier.id,
          operateurId: operateur.id,
          dateDebut: dateValidation,
          dateFin: dateNumerisation,
          nombrePages: dossier.nombrePages,
          statut: "TERMINEE",
          qualite: faker.helpers.arrayElement(["BONNE", "BONNE", "MOYENNE", "FAIBLE"]),
        },
      });
      await prisma.document.create({
        data: {
          dossierId: dossier.id,
          nomFichier: `${reference}.pdf`,
          nomOriginal: `${reference}_scan.pdf`,
          typeMime: "application/pdf",
          extension: "pdf",
          taille: faker.number.int({ min: 200_000, max: 8_000_000 }),
          url: `/storage/dossiers/${reference}.pdf`,
          storageProvider: "LOCAL",
          hash: faker.string.hexadecimal({ length: 64, casing: "lower", prefix: "" }),
          nombrePages: dossier.nombrePages,
          uploadedBy: operateur.userId,
          createdAt: dateNumerisation,
        },
      });
    }
    if (dateIndexation) {
      await prisma.indexation.create({
        data: {
          dossierId: dossier.id,
          operateurId: operateur.id,
          dateDebut: dateNumerisation,
          dateFin: dateIndexation,
          statut: "TERMINEE",
          scoreQualite: faker.number.int({ min: 60, max: 100 }),
        },
      });
    }
    if (dateArchivage) {
      await prisma.archivage.create({
        data: {
          dossierId: dossier.id,
          operateurId: operateur.id,
          dateArchivage,
          emplacement: `Salle A / Rayon ${faker.number.int({ min: 1, max: 20 })} / Boîte ${faker.number.int({ min: 1, max: 50 })}`,
          referenceArchivage: `ARC-${faker.string.alphanumeric(8).toUpperCase()}`,
          statut: "TERMINEE",
        },
      });
    }

    // Contrôle qualité + anomalies sur ~15% des dossiers
    if (faker.datatype.boolean({ probability: 0.15 })) {
      const hasAnomalie = faker.datatype.boolean({ probability: 0.6 });
      const qc = await prisma.qualityCheck.create({
        data: {
          dossierId: dossier.id,
          userId: superviseur.id,
          typeControle: "CONTROLE_SAISIE",
          score: hasAnomalie ? faker.number.int({ min: 40, max: 85 }) : faker.number.int({ min: 90, max: 100 }),
          statut: hasAnomalie ? "A_CORRIGER" : "CONFORME",
          nombreAnomalies: hasAnomalie ? 1 : 0,
          createdAt: dateValidation ?? createdAt,
        },
      });
      if (hasAnomalie) {
        await prisma.anomalie.create({
          data: {
            dossierId: dossier.id,
            qualityCheckId: qc.id,
            type: faker.helpers.arrayElement(["CHAMP_MANQUANT", "FORMAT_INVALIDE", "INCOHERENCE", "ERREUR_SAISIE"]),
            champ: faker.helpers.arrayElement(["telephone", "email", "superficie", "numeroTitreFoncier"]),
            description: faker.lorem.sentence(),
            gravite: faker.helpers.arrayElement(["FAIBLE", "MOYENNE", "ELEVEE", "CRITIQUE"]),
            statut: faker.helpers.arrayElement(["OUVERTE", "EN_COURS", "CORRIGEE"]),
            createdAt: dateValidation ?? createdAt,
          },
        });
      }
    }
  }
  console.log(`✔ ${TOTAL_DOSSIERS} dossiers fictifs générés avec historique/numérisation/indexation/archivage/qualité`);

  // 11. Journal d'audit + notifications minimales
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "SEED", entity: "DATABASE", newValue: { info: "Seed de démonstration exécuté" } },
  });
  await prisma.notification.create({
    data: { userId: admin.id, type: "SYSTEM", titre: "Base initialisée", message: "Le seed de démonstration a été exécuté avec succès." },
  });

  console.log("\nSeed terminé avec succès.");
  console.log(`Comptes de démonstration (mot de passe unique) : ${DEMO_PASSWORD}`);
  console.log("  admin@mulcv-demo.local | superviseur@mulcv-demo.local | consultation@mulcv-demo.local | operateur1..3@mulcv-demo.local");
}

main()
  .catch((e) => {
    console.error("Erreur durant le seed :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
