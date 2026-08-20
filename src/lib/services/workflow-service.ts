import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { ApiError } from "@/lib/utils/api-error";
import { isOperateurInScope } from "@/lib/services/access-scope";
import type { SessionPayload } from "@/lib/auth/session";

async function getDossierOr404(id: number) {
  const dossier = await prisma.dossier.findUnique({ where: { id } });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);
  return dossier;
}

async function resolveOperateurId(session: SessionPayload): Promise<number | null> {
  if (session.roleCode !== "OPERATEUR") return null;
  const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
  return operateur?.id ?? null;
}

/**
 * Phase 16+ (affectation opérateur -> superviseur), réutilisée Phase 19+
 * pour les 4 étapes (Collecte/Numérisation/Indexation/Archivage) : un
 * SUPERVISEUR ne peut valider/rejeter que les dossiers des opérateurs qui
 * lui sont affectés (Operateur.supervisorId). Ne s'applique pas aux autres
 * rôles disposant des permissions *_VALIDATE/*_REJECT (seul ADMIN les a en
 * plus de SUPERVISEUR — pas de restriction pour lui).
 */
async function assertSupervisorScope(session: SessionPayload, operateurId: number) {
  if (session.roleCode !== "SUPERVISEUR") return;
  if (!(await isOperateurInScope(session, operateurId))) {
    throw new ApiError(
      "Vous ne pouvez valider que les dossiers des opérateurs qui vous sont affectés.",
      403
    );
  }
}

/**
 * Le workflow linéaire (§42) : un dossier ne peut pas être ARCHIVÉ s'il n'est
 * pas INDEXÉ, ni INDEXÉ s'il n'est pas NUMÉRISÉ, ni NUMÉRISÉ s'il n'est pas
 * VALIDÉ, ni VALIDÉ/REJETÉ s'il n'est pas EN CONTRÔLE (donc SOUMIS).
 * Chaque fonction vérifie sa propre précondition avant toute écriture —
 * défense en profondeur, jamais de confiance dans l'état affiché au client.
 */

export async function validateDossier(id: number, commentaire?: string) {
  const session = await requireApiPermission("DOSSIER_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutValidation !== "EN_CONTROLE") {
    throw new ApiError(
      `Impossible de valider : le dossier doit être "En contrôle" (statut actuel : ${dossier.statutValidation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutValidation: "VALIDE", dateValidation: now } }),
    prisma.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "VALIDATION",
        ancienStatut: "EN_CONTROLE",
        nouveauStatut: "VALIDE",
        commentaire,
      },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "VALIDATION", fromStatus: "EN_CONTROLE", toStatus: "VALIDE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectDossier(id: number, commentaire: string) {
  const session = await requireApiPermission("DOSSIER_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutValidation !== "EN_CONTROLE") {
    throw new ApiError(
      `Impossible de rejeter : le dossier doit être "En contrôle" (statut actuel : ${dossier.statutValidation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutValidation: "REJETE", dateValidation: now } }),
    prisma.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "REJET",
        ancienStatut: "EN_CONTROLE",
        nouveauStatut: "REJETE",
        commentaire,
      },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "VALIDATION", fromStatus: "EN_CONTROLE", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

/**
 * Phase 19+ : chaque étape opérationnelle (Numérisation/Indexation/Archivage),
 * comme la Collecte déjà en place, passe désormais par une validation
 * superviseur avant d'être considérée terminée :
 *
 *   EN_ATTENTE/EN_COURS --(opérateur agit)--> A_VALIDER
 *     --(superviseur valide)--> TERMINE   [débloque l'étape suivante, inchangé]
 *     --(superviseur rejette)--> REJETE --(opérateur relance)--> A_VALIDER
 */

export async function numerizeDossier(id: number, nombrePages?: number) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutValidation !== "VALIDE") {
    throw new ApiError(
      `Impossible de numériser : le dossier doit être "Validé" (statut actuel : ${dossier.statutValidation}).`
    );
  }
  if (dossier.statutNumerisation === "A_VALIDER") {
    throw new ApiError("La numérisation de ce dossier est déjà soumise, en attente de validation du superviseur.");
  }
  if (dossier.statutNumerisation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà numérisé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({
      where: { id },
      data: { statutNumerisation: "A_VALIDER", ...(nombrePages ? { nombrePages } : {}) },
    }),
    prisma.numerisation.create({
      data: {
        dossierId: id,
        operateurId,
        dateDebut: now,
        dateFin: now,
        nombrePages: nombrePages ?? dossier.nombrePages,
        statut: "TERMINEE",
      },
    }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION", ancienStatut: dossier.statutNumerisation, nouveauStatut: "A_VALIDER" },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: dossier.statutNumerisation, toStatus: "A_VALIDER", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_NUMERIZE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function validateNumerisation(id: number, commentaire?: string) {
  const session = await requireApiPermission("NUMERISATION_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutNumerisation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : la numérisation doit être "À valider" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutNumerisation: "TERMINE", dateNumerisation: now } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "NUMERISATION_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectNumerisation(id: number, commentaire: string) {
  const session = await requireApiPermission("NUMERISATION_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutNumerisation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : la numérisation doit être "À valider" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutNumerisation: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "NUMERISATION_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function indexDossier(id: number, scoreQualite?: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutNumerisation !== "TERMINE") {
    throw new ApiError(
      `Impossible d'indexer : le dossier doit être "Numérisé" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }
  if (dossier.statutIndexation === "A_VALIDER") {
    throw new ApiError("L'indexation de ce dossier est déjà soumise, en attente de validation du superviseur.");
  }
  if (dossier.statutIndexation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà indexé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutIndexation: "A_VALIDER" } }),
    prisma.indexation.create({
      data: { dossierId: id, operateurId, dateDebut: now, dateFin: now, statut: "TERMINEE", scoreQualite },
    }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION", ancienStatut: dossier.statutIndexation, nouveauStatut: "A_VALIDER" },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: dossier.statutIndexation, toStatus: "A_VALIDER", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_INDEX", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function validateIndexation(id: number, commentaire?: string) {
  const session = await requireApiPermission("INDEXATION_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutIndexation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : l'indexation doit être "À valider" (statut actuel : ${dossier.statutIndexation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutIndexation: "TERMINE", dateIndexation: now } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "INDEXATION_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectIndexation(id: number, commentaire: string) {
  const session = await requireApiPermission("INDEXATION_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutIndexation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : l'indexation doit être "À valider" (statut actuel : ${dossier.statutIndexation}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutIndexation: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "INDEXATION_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function archiveDossier(id: number, emplacement: string, referenceArchivage?: string) {
  const session = await requireApiPermission("ARCHIVAGE_UPDATE");
  if (!emplacement?.trim()) {
    throw new ApiError("L'emplacement d'archivage est requis.");
  }
  const dossier = await getDossierOr404(id);

  // Règle explicite du cahier des charges (§42) : un dossier ne peut pas être
  // ARCHIVÉ s'il n'est pas INDEXÉ.
  if (dossier.statutIndexation !== "TERMINE") {
    throw new ApiError(
      `Impossible d'archiver : le dossier doit être "Indexé" (statut actuel : ${dossier.statutIndexation}).`
    );
  }
  if (dossier.statutArchivage === "A_VALIDER") {
    throw new ApiError("L'archivage de ce dossier est déjà soumis, en attente de validation du superviseur.");
  }
  if (dossier.statutArchivage === "TERMINE") {
    throw new ApiError("Ce dossier est déjà archivé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "A_VALIDER" } }),
    prisma.archivage.create({
      data: {
        dossierId: id,
        operateurId,
        dateArchivage: now,
        emplacement,
        referenceArchivage,
        statut: "TERMINEE",
      },
    }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE", ancienStatut: dossier.statutArchivage, nouveauStatut: "A_VALIDER", commentaire: emplacement },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: dossier.statutArchivage, toStatus: "A_VALIDER", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_ARCHIVE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function validateArchivage(id: number, commentaire?: string) {
  const session = await requireApiPermission("ARCHIVAGE_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutArchivage !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : l'archivage doit être "À valider" (statut actuel : ${dossier.statutArchivage}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "TERMINE", dateArchivage: now } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "ARCHIVAGE_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectArchivage(id: number, commentaire: string) {
  const session = await requireApiPermission("ARCHIVAGE_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutArchivage !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : l'archivage doit être "À valider" (statut actuel : ${dossier.statutArchivage}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "ARCHIVAGE_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}
