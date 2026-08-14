import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { ApiError } from "@/lib/utils/api-error";
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
 * Le workflow linéaire (§42) : un dossier ne peut pas être ARCHIVÉ s'il n'est
 * pas INDEXÉ, ni INDEXÉ s'il n'est pas NUMÉRISÉ, ni NUMÉRISÉ s'il n'est pas
 * VALIDÉ, ni VALIDÉ/REJETÉ s'il n'est pas EN CONTRÔLE (donc SOUMIS).
 * Chaque fonction vérifie sa propre précondition avant toute écriture —
 * défense en profondeur, jamais de confiance dans l'état affiché au client.
 */

export async function validateDossier(id: number, commentaire?: string) {
  const session = await requireApiPermission("DOSSIER_VALIDATE");
  const dossier = await getDossierOr404(id);

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

export async function numerizeDossier(id: number, nombrePages?: number) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutValidation !== "VALIDE") {
    throw new ApiError(
      `Impossible de numériser : le dossier doit être "Validé" (statut actuel : ${dossier.statutValidation}).`
    );
  }
  if (dossier.statutNumerisation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà numérisé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({
      where: { id },
      data: { statutNumerisation: "TERMINE", dateNumerisation: now, ...(nombrePages ? { nombrePages } : {}) },
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
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION", nouveauStatut: "TERMINE" },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: "EN_ATTENTE", toStatus: "TERMINE", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_NUMERIZE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
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
  if (dossier.statutIndexation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà indexé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutIndexation: "TERMINE", dateIndexation: now } }),
    prisma.indexation.create({
      data: { dossierId: id, operateurId, dateDebut: now, dateFin: now, statut: "TERMINEE", scoreQualite },
    }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION", nouveauStatut: "TERMINE" },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: "EN_ATTENTE", toStatus: "TERMINE", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_INDEX", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
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
  if (dossier.statutArchivage === "TERMINE") {
    throw new ApiError("Ce dossier est déjà archivé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "TERMINE", dateArchivage: now } }),
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
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE", nouveauStatut: "TERMINE", commentaire: emplacement },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: "EN_ATTENTE", toStatus: "TERMINE", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_ARCHIVE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}
