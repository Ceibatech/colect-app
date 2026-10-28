"use server";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { hashPassword } from "@/lib/auth/password";
import { createUserSchema, updateUserSchema } from "@/lib/validation/user-admin";
import { issuePasswordAccessEmail } from "@/lib/services/password-reset-service";
import { Prisma } from "@prisma/client";
import { SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";
import { isDeletionConfirmed, userDeletionBlockers, type UserDeletionBlockerKey } from "@/lib/utils/user-deletion";

/**
 * CRUD administration des utilisateurs (Phase 15+, §11) — un utilisateur est
 * référencé par de nombreux historiques (dossier_history, workflow_transitions,
 * transferts...). La désactivation (`isActive`) empêche la connexion sans
 * perdre l'historique. La suppression physique (`deleteUser`) n'est autorisée
 * que pour un compte sans aucune trace métier (voir lib/utils/user-deletion.ts).
 *
 * Lien Opérateur : un utilisateur de rôle OPERATEUR a besoin d'une fiche
 * `operateurs` (1:1, `userId`) pour apparaître dans les listes d'opérateurs
 * actifs et pouvoir créer/soumettre des dossiers (cf. dossier-service.ts,
 * workflow-service.ts::resolveOperateurId). Ce lien est créé/désactivé
 * automatiquement ici selon le rôle choisi — jamais à la charge de
 * l'administrateur de le faire manuellement ailleurs.
 */

export interface ActionResult {
  error?: string;
  success?: boolean;
  message?: string;
  warning?: string;
}

export async function listUsersWithRoles() {
  await requirePermission("USER_MANAGE");
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      role: true,
      operateur: { select: { id: true, matricule: true, isActive: true } },
      pmoSupervisorScopes: { select: { supervisorUserId: true } },
      responsibleSites: { select: { siteId: true } },
      _count: { select: { supervisedOperateurs: true } },
    },
  });
}

/** Sites actifs pouvant être rattachés à un responsable de site. */
export async function listActiveSitesForAssignment() {
  await requirePermission("USER_MANAGE");
  return prisma.site.findMany({
    where: { isActive: true },
    orderBy: [{ organisation: "asc" }, { nom: "asc" }],
    select: { id: true, code: true, nom: true, organisation: true },
  });
}

async function validateResponsibleSites(roleCode: string, siteIds: number[]): Promise<string | null> {
  if (roleCode !== SITE_RESPONSIBLE_ROLE_CODE) return null;
  const unique = [...new Set(siteIds)];
  if (unique.length === 0) return "Rattachez au moins un site au responsable de site.";
  const valid = await prisma.site.count({ where: { id: { in: unique }, isActive: true } });
  return valid === unique.length ? null : "Un site sélectionné est inactif ou introuvable.";
}

export async function listRoles() {
  await requirePermission("USER_MANAGE");
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}

/**
 * Opérateurs actifs disponibles pour l'affectation à un superviseur
 * (Phase 16+), avec leur affectation actuelle le cas échéant — un
 * administrateur peut ainsi voir qu'il "vole" un opérateur déjà affecté à
 * un autre superviseur avant de confirmer.
 */
export async function listActiveOperateursForAssignment() {
  await requirePermission("USER_MANAGE");
  return prisma.operateur.findMany({
    where: { isActive: true },
    orderBy: { nom: "asc" },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenoms: true,
      supervisorId: true,
      supervisor: { select: { id: true, name: true } },
    },
  });
}

/** Superviseurs disponibles pour constituer le périmètre d'un compte PMO. */
export async function listActiveSupervisorsForPmoAssignment() {
  await requirePermission("USER_MANAGE");
  return prisma.user.findMany({
    where: { isActive: true, role: { code: "SUPERVISEUR" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      _count: { select: { supervisedOperateurs: true } },
    },
  });
}
async function nextOperateurMatricule(): Promise<string> {
  const count = await prisma.operateur.count();
  let n = count + 1;
  // Boucle de sécurité si une matricule a été supprimée/réutilisée entre-temps (unique constraint).
  for (let attempts = 0; attempts < 1000; attempts++) {
    const candidate = `OP-${String(n).padStart(3, "0")}`;
    const exists = await prisma.operateur.findUnique({ where: { matricule: candidate } });
    if (!exists) return candidate;
    n++;
  }
  throw new Error("Impossible de générer une matricule opérateur unique.");
}

function needsOperateurProfile(roleCode: string) {
  return roleCode === "OPERATEUR" || roleCode === "AGENT_INVENTAIRE";
}

export async function createUser(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("USER_MANAGE");
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    telephone: formData.get("telephone"),
    supervisorIds: formData.getAll("supervisorIds"),
    siteIds: formData.getAll("siteIds"),
  });
  const sendInvitation = formData.get("sendInvitation") === "on";
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: `L'e-mail "${email}" est déjà utilisé.` };

  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return { error: "Rôle introuvable." };

  if (role.code === "PMO" && parsed.data.supervisorIds.length > 0) {
    const uniqueSupervisorIds = [...new Set(parsed.data.supervisorIds)];
    const validSupervisors = await prisma.user.count({
      where: { id: { in: uniqueSupervisorIds }, isActive: true, role: { code: "SUPERVISEUR" } },
    });
    if (validSupervisors !== uniqueSupervisorIds.length) {
      return { error: "Un superviseur sélectionné est inactif ou n'a plus le rôle Superviseur." };
    }
  }

  const siteError = await validateResponsibleSites(role.code, parsed.data.siteIds);
  if (siteError) return { error: siteError };

  // Le compte est créé avec un secret aléatoire jamais montré à
  // l'administrateur. Seul le lien d'activation à usage unique permet à la
  // personne concernée de définir son propre mot de passe.
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const ip = await getClientIp();
  const matricule = needsOperateurProfile(role.code) ? await nextOperateurMatricule() : null;
  const supervisorIds = [...new Set(parsed.data.supervisorIds)];

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name: parsed.data.name, email, passwordHash, roleId: role.id },
    });

    if (needsOperateurProfile(role.code) && matricule) {
      await tx.operateur.create({
        data: {
          userId: created.id,
          matricule,
          nom: parsed.data.name,
          telephone: parsed.data.telephone || null,
          email,
          isActive: true,
        },
      });
    }

    if (role.code === "PMO" && supervisorIds.length > 0) {
      await tx.pmoSupervisorScope.createMany({
        data: supervisorIds.map((supervisorUserId) => ({ pmoUserId: created.id, supervisorUserId })),
        skipDuplicates: true,
      });
    }

    if (role.code === SITE_RESPONSIBLE_ROLE_CODE) {
      await tx.userSite.createMany({
        data: [...new Set(parsed.data.siteIds)].map((siteId) => ({ userId: created.id, siteId })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "USER_CREATE",
        entity: "USER",
        entityId: created.id,
        newValue: { name: created.name, email, role: role.code, pmoSupervisorCount: role.code === "PMO" ? supervisorIds.length : 0, siteIds: role.code === SITE_RESPONSIBLE_ROLE_CODE ? [...new Set(parsed.data.siteIds)] : [] },
        ipAddress: ip,
      },
    });
    return created;
  });

  if (sendInvitation) {
    try {
      await issuePasswordAccessEmail({ user, purpose: "ACTIVATE" });
      await prisma.auditLog.create({
        data: { userId: session.userId, action: "USER_INVITATION_EMAIL", entity: "USER", entityId: user.id, ipAddress: ip },
      });
      return { success: true, message: "Compte créé et invitation envoyée." };
    } catch (error) {
      console.error("User invitation email delivery failed.", error);
      return {
        success: true,
        warning: "Le compte a été créé, mais l'invitation n'a pas pu être envoyée. Vérifiez la configuration Resend puis renvoyez l'accès depuis la liste.",
      };
    }
  }

  return { success: true, message: "Compte créé." };
}

export async function updateUser(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("USER_MANAGE");
  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    roleId: formData.get("roleId"),
    isActive: formData.get("isActive") === "on",
    operateurIds: formData.getAll("operateurIds"),
    supervisorIds: formData.getAll("supervisorIds"),
    siteIds: formData.getAll("siteIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const before = await prisma.user.findUnique({ where: { id }, include: { role: true, operateur: true, pmoSupervisorScopes: true } });
  if (!before) return { error: "Utilisateur introuvable." };

  const newRole = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!newRole) return { error: "Rôle introuvable." };

  if (before.id === session.userId && !parsed.data.isActive) {
    return { error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  // Phase 16+ : un opérateur déjà affecté à un AUTRE superviseur ne peut
  // plus être affecté ici — il faut d'abord retirer son affectation
  // actuelle (depuis la fiche de ce superviseur) avant de pouvoir le
  // réaffecter. Contrôlé aussi côté client (case décochée/désactivée dans
  // OperateurAssignmentField) mais revérifié ici, jamais de confiance dans
  // le formulaire (§60).
  if (newRole.code === "SUPERVISEUR" && parsed.data.operateurIds.length > 0) {
    const conflicting = await prisma.operateur.findMany({
      where: { id: { in: parsed.data.operateurIds }, supervisorId: { not: null, notIn: [id] } },
      select: { nom: true, prenoms: true },
    });
    if (conflicting.length > 0) {
      const names = conflicting.map((o) => `${o.nom} ${o.prenoms ?? ""}`.trim()).join(", ");
      return {
        error: `Déjà affecté(s) à un autre superviseur : ${names}. Retirez d'abord leur affectation actuelle avant de les réaffecter ici.`,
      };
    }
  }

  if (newRole.code === "PMO" && parsed.data.supervisorIds.length > 0) {
    const validSupervisors = await prisma.user.count({
      where: { id: { in: parsed.data.supervisorIds }, isActive: true, role: { code: "SUPERVISEUR" } },
    });
    if (validSupervisors !== new Set(parsed.data.supervisorIds).size) {
      return { error: "Un superviseur sélectionné est inactif ou n'a plus le rôle Superviseur." };
    }
  }

  const siteError = await validateResponsibleSites(newRole.code, parsed.data.siteIds);
  if (siteError) return { error: siteError };
  const previousSiteIds = (await prisma.userSite.findMany({ where: { userId: id }, select: { siteId: true } })).map((row) => row.siteId).sort((a, b) => a - b);
  const desiredSiteIds = newRole.code === SITE_RESPONSIBLE_ROLE_CODE ? [...new Set(parsed.data.siteIds)].sort((a, b) => a - b) : [];
  const sitesChanged = previousSiteIds.join(",") !== desiredSiteIds.join(",");

  const ip = await getClientIp();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        roleId: newRole.id,
        isActive: parsed.data.isActive,
        ...(before.roleId !== newRole.id || before.isActive !== parsed.data.isActive || sitesChanged
          ? { sessionVersion: { increment: 1 } }
          : {}),
      },
    });

    if (needsOperateurProfile(newRole.code) && !before.operateur) {
      const matricule = await nextOperateurMatricule();
      await tx.operateur.create({
        data: { userId: id, matricule, nom: parsed.data.name, email: before.email, isActive: true },
      });
    } else if (needsOperateurProfile(newRole.code) && before.operateur) {
      await tx.operateur.update({ where: { id: before.operateur.id }, data: { nom: parsed.data.name, isActive: parsed.data.isActive } });
    } else if (!needsOperateurProfile(newRole.code) && before.operateur?.isActive) {
      // Rôle changé hors OPERATEUR : désactive la fiche opérateur (jamais de
      // suppression — les dossiers déjà traités par cette fiche restent valides).
      await tx.operateur.update({ where: { id: before.operateur.id }, data: { isActive: false } });
    }

    // Phase 16+ (affectation opérateur -> superviseur, §workflow validation) :
    // synchronise Operateur.supervisorId sur la liste choisie dans le
    // formulaire. `notIn: desired` avec `desired` vide équivaut à "pas de
    // filtre" côté Prisma (undefined ignoré) -> libère tout le monde.
    if (newRole.code === "SUPERVISEUR" && parsed.data.isActive) {
      const desired = parsed.data.operateurIds;
      await tx.operateur.updateMany({
        where: { supervisorId: id, ...(desired.length ? { id: { notIn: desired } } : {}) },
        data: { supervisorId: null },
      });
      if (desired.length > 0) {
        // `OR supervisorId null/mine` : re-garde-fou contre une réaffectation
        // concurrente survenue entre la vérification ci-dessus et cette
        // écriture (§60) — un opérateur affecté entre-temps à un autre
        // superviseur reste inchangé plutôt que d'être silencieusement volé.
        await tx.operateur.updateMany({
          where: { id: { in: desired }, OR: [{ supervisorId: null }, { supervisorId: id }] },
          data: { supervisorId: id },
        });
      }
    } else if (before.role.code === "SUPERVISEUR") {
      // Rôle changé hors SUPERVISEUR : libère son équipe et le retire des
      // périmètres PMO qui le référenceaient.
      await tx.operateur.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
      await tx.pmoSupervisorScope.deleteMany({ where: { supervisorUserId: id } });
    }

    if (newRole.code === "PMO") {
      const desired = [...new Set(parsed.data.supervisorIds)];
      await tx.pmoSupervisorScope.deleteMany({
        where: { pmoUserId: id, ...(desired.length ? { supervisorUserId: { notIn: desired } } : {}) },
      });
      if (desired.length > 0) {
        await tx.pmoSupervisorScope.createMany({
          data: desired.map((supervisorUserId) => ({ pmoUserId: id, supervisorUserId })),
          skipDuplicates: true,
        });
      }
    } else if (before.role.code === "PMO") {
      await tx.pmoSupervisorScope.deleteMany({ where: { pmoUserId: id } });
    }

    if (sitesChanged) {
      await tx.userSite.deleteMany({ where: { userId: id } });
      if (desiredSiteIds.length) await tx.userSite.createMany({ data: desiredSiteIds.map((siteId) => ({ userId: id, siteId })) });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "USER_UPDATE",
        entity: "USER",
        entityId: id,
        oldValue: { name: before.name, role: before.role.code, isActive: before.isActive, siteIds: previousSiteIds },
        newValue: { name: parsed.data.name, role: newRole.code, isActive: parsed.data.isActive, pmoSupervisorCount: newRole.code === "PMO" ? parsed.data.supervisorIds.length : 0, siteIds: desiredSiteIds },
        ipAddress: ip,
      },
    });
  });

  return { success: true };
}

class UserDeletionRefused extends Error {}

/**
 * Compte toutes les traces métier d'un compte. Chaque relation vers `users` en
 * SET NULL doit figurer ici : sinon la suppression effacerait l'auteur sans
 * prévenir (les relations RESTRICT feraient seulement échouer la suppression).
 */
async function countUserTraces(db: Prisma.TransactionClient, id: number): Promise<Record<UserDeletionBlockerKey, number>> {
  const [
    dossierHistory, workflowTransitions, documentsUploaded, documentsPreIndexed, indexingJobsRequested, indexingRunsTriggered,
    imports, exports, qualityChecks, anomaliesCorrected, dossiersPrepared, dossiersConditioned, reconditionnementSessions, preparationPieceLines,
    financeRatesCreated, transferLotsCreated, transferLotsAuthorized, transferLotsCeibacValidated, transferMovementsCreated,
    transferMovementsCeibacValidated, transferMovementsMinistryValidated, transferSignaturesCaptured, transferTrackingPoints, transferConvoyEvents,
    transferLotParticipations, emailReportSubscriptionsCreated, emailReportsTriggered, supervisedOperateurs, caisseMouvements,
    operateurDossiers, operateurNumerisations, operateurIndexations, operateurArchivages,
  ] = await Promise.all([
    db.dossierHistory.count({ where: { userId: id } }),
    db.workflowTransition.count({ where: { userId: id } }),
    db.document.count({ where: { uploadedBy: id } }),
    db.document.count({ where: { preIndexedBy: id } }),
    db.documentIndexingJob.count({ where: { requestedBy: id } }),
    db.documentIndexingRun.count({ where: { triggeredBy: id } }),
    db.import.count({ where: { userId: id } }),
    db.export.count({ where: { userId: id } }),
    db.qualityCheck.count({ where: { userId: id } }),
    db.anomalie.count({ where: { corrigePar: id } }),
    db.dossier.count({ where: { preparateurId: id } }),
    db.dossier.count({ where: { conditionneurId: id } }),
    db.reconditionnementSession.count({ where: { userId: id } }),
    db.preparationPieceLine.count({ where: { preparedById: id } }),
    db.financeRate.count({ where: { createdById: id } }),
    db.transferLot.count({ where: { createdById: id } }),
    db.transferLot.count({ where: { authorizedById: id } }),
    db.transferLot.count({ where: { ceibacValidatedById: id } }),
    db.transferMovement.count({ where: { createdById: id } }),
    db.transferMovement.count({ where: { ceibacValidatedById: id } }),
    db.transferMovement.count({ where: { ministryValidatedById: id } }),
    db.transferSignature.count({ where: { capturedById: id } }),
    db.transferTrackingPoint.count({ where: { capturedById: id } }),
    db.transferConvoyEvent.count({ where: { userId: id } }),
    db.transferLotParticipant.count({ where: { userId: id } }),
    db.emailReportSubscription.count({ where: { createdById: id } }),
    db.emailReportDelivery.count({ where: { triggeredById: id } }),
    db.operateur.count({ where: { supervisorId: id } }),
    db.caisseMouvement.count({ where: { userId: id } }),
    db.dossier.count({ where: { operateur: { userId: id } } }),
    db.numerisation.count({ where: { operateur: { userId: id } } }),
    db.indexation.count({ where: { operateur: { userId: id } } }),
    db.archivage.count({ where: { operateur: { userId: id } } }),
  ]);
  return {
    dossierHistory, workflowTransitions, documentsUploaded, documentsPreIndexed, indexingJobsRequested, indexingRunsTriggered,
    imports, exports, qualityChecks, anomaliesCorrected, dossiersPrepared, dossiersConditioned, reconditionnementSessions, preparationPieceLines,
    financeRatesCreated, transferLotsCreated, transferLotsAuthorized, transferLotsCeibacValidated, transferMovementsCreated,
    transferMovementsCeibacValidated, transferMovementsMinistryValidated, transferSignaturesCaptured, transferTrackingPoints, transferConvoyEvents,
    transferLotParticipations, emailReportSubscriptionsCreated, emailReportsTriggered, supervisedOperateurs, caisseMouvements,
    operateurDossiers: operateurDossiers + operateurNumerisations + operateurIndexations + operateurArchivages,
  };
}

/**
 * Suppression définitive d'un compte, réservée à USER_MANAGE. Refusée pour
 * son propre compte, pour le dernier administrateur et pour tout compte ayant
 * laissé une trace métier (on propose alors la désactivation). Les événements
 * d'audit déjà journalisés par ce compte restent, sans auteur ; l'entrée
 * USER_DELETE conserve son identité.
 */
export async function deleteUser(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  void _prevState;
  const session = await requirePermission("USER_MANAGE");
  if (id === session.userId) return { error: "Vous ne pouvez pas supprimer votre propre compte." };

  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: true, operateur: { select: { id: true, matricule: true } } },
  });
  if (!user) return { error: "Utilisateur introuvable." };

  if (!isDeletionConfirmed(String(formData.get("confirmEmail") ?? ""), user.email)) {
    return { error: "L'e-mail saisi ne correspond pas au compte à supprimer." };
  }

  const ip = await getClientIp();
  try {
    await prisma.$transaction(async (tx) => {
      // Verrou du compte : toute écriture qui le référence (clé étrangère) attend
      // la fin de cette transaction. Les traces sont donc comptées sans course.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${id} FOR UPDATE`);
      if (user.role.code === "ADMIN") {
        // Deux administrateurs qui se suppriment l'un l'autre en même temps ne
        // doivent pas laisser l'application sans administrateur actif.
        const admins = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
          SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
          WHERE r.code = 'ADMIN' AND u.is_active = TRUE AND u.id <> ${id}
          ORDER BY u.id FOR UPDATE`);
        if (admins.length === 0) throw new UserDeletionRefused("Impossible de supprimer le dernier administrateur actif.");
      }

      const blockers = userDeletionBlockers(await countUserTraces(tx, id));
      if (blockers.length > 0) {
        throw new UserDeletionRefused(`Suppression impossible : ce compte a laissé une trace dans l'application (${blockers.join(", ")}). Désactivez-le plutôt pour conserver l'historique.`);
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "USER_DELETE",
          entity: "USER",
          entityId: id,
          oldValue: { name: user.name, email: user.email, role: user.role.code, matricule: user.operateur?.matricule ?? null },
          ipAddress: ip,
        },
      });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.transferEmailDelivery.deleteMany({ where: { recipientUserId: id } });
      await tx.emailReportDelivery.deleteMany({ where: { recipientUserId: id } });
      if (user.operateur) await tx.operateur.delete({ where: { id: user.operateur.id } });
      // PasswordResetToken, PmoSupervisorScope et EmailReportSubscription sont en cascade.
      await tx.user.delete({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    if (error instanceof UserDeletionRefused) return { error: error.message };
    console.error("User deletion failed.", error);
    return { error: "Suppression impossible : des données restent liées à ce compte. Désactivez-le plutôt." };
  }

  return { success: true, message: `Compte ${user.email} supprimé.` };
}

export async function sendUserAccessEmail(
  id: number,
  _prevState: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  void _prevState;
  void _formData;
  const session = await requirePermission("USER_MANAGE");
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isActive: true, lastLoginAt: true },
  });
  if (!user) return { error: "Utilisateur introuvable." };
  if (!user.isActive) return { error: "Activez ce compte avant d'envoyer un accès." };

  const ip = await getClientIp();
  const purpose = user.lastLoginAt ? "RESET" : "ACTIVATE";

  try {
    await issuePasswordAccessEmail({ user, purpose });
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: purpose === "ACTIVATE" ? "USER_INVITATION_EMAIL" : "PASSWORD_RESET_EMAIL_ADMIN",
        entity: "USER",
        entityId: user.id,
        ipAddress: ip,
      },
    });
    return { success: true, message: `Lien sécurisé envoyé à ${user.email}.` };
  } catch (error) {
    console.error("User access email delivery failed.", error);
    return { error: "Envoi impossible. Vérifiez la clé Resend, le domaine expéditeur et l'adresse du destinataire." };
  }
}

export async function sendPendingUsersAccessEmails(
  _prevState: ActionResult,
  _formData: FormData
): Promise<ActionResult> {
  void _prevState;
  void _formData;
  const session = await requirePermission("USER_MANAGE");
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      lastLoginAt: null,
      passwordResetTokens: {
        none: { purpose: "ACTIVATE", usedAt: null, expiresAt: { gt: new Date() } },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, name: true, email: true },
  });

  if (users.length === 0) {
    return { success: true, message: "Aucune nouvelle invitation à envoyer pour le moment." };
  }

  const ip = await getClientIp();
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await issuePasswordAccessEmail({ user, purpose: "ACTIVATE" });
      await prisma.auditLog.create({
        data: { userId: session.userId, action: "USER_INVITATION_EMAIL", entity: "USER", entityId: user.id, ipAddress: ip },
      });
      sent++;
    } catch (error) {
      console.error("Bulk user invitation email delivery failed.", error);
      failed++;
    }
  }

  if (sent === 0) {
    return { error: "Aucune invitation n'a pu être envoyée. Vérifiez la configuration Resend." };
  }

  return {
    success: true,
    message: `${sent} invitation${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}.`,
    warning: failed > 0 ? `${failed} envoi${failed > 1 ? "s" : ""} en échec.` : undefined,
  };
}
