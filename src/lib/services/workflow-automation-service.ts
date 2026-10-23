import "server-only";

import { prisma } from "@/lib/prisma/client";
import { decideDossierIndexationStatus } from "@/lib/workflow/automatic-validation";

async function resolveOperateurForUser(userId: number | null) {
  if (!userId) return null;
  const operateur = await prisma.operateur.findUnique({ where: { userId }, select: { id: true } });
  return operateur?.id ?? null;
}

/**
 * Un fichier déposé constitue une preuve de numérisation. Dès que la
 * préparation est terminée, la numérisation avance donc sans visa humain et
 * l'indexation (re)démarre. Un dossier archivé reste immuable : ce contrôle
 * est assuré avant l'appel, dans document-service.
 */
export async function advanceDossierAfterDocumentAvailable(
  dossierId: number,
  actorUserId: number | null,
  trigger: "AJOUT_DOCUMENT" | "PREPARATION_TERMINEE" = "AJOUT_DOCUMENT",
) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      statutPreparation: true,
      statutNumerisation: true,
      statutConditionnement: true,
      statutIndexation: true,
      statutArchivage: true,
      nombrePages: true,
      documents: { select: { id: true, nombrePages: true } },
    },
  });
  if (!dossier || dossier.statutPreparation !== "TERMINE" || dossier.documents.length === 0) return;

  const now = new Date();
  const numerisationChanged = dossier.statutNumerisation !== "TERMINE";
  const indexationChanged = dossier.statutConditionnement === "TERMINE" && dossier.statutIndexation !== "EN_COURS";
  const archivageReopened = dossier.statutArchivage === "A_VALIDER";
  const documentPages = dossier.documents.reduce((sum, document) => sum + (document.nombrePages ?? 0), 0);
  const operateurId = numerisationChanged ? await resolveOperateurForUser(actorUserId) : null;

  if (numerisationChanged || indexationChanged || archivageReopened) {
    await prisma.$transaction(async (tx) => {
      await tx.dossier.update({
        where: { id: dossierId },
        data: {
          ...(numerisationChanged
            ? { statutNumerisation: "TERMINE", dateNumerisation: now }
            : {}),
          ...(indexationChanged
            ? { statutIndexation: "EN_COURS", dateIndexation: null }
            : {}),
          ...(archivageReopened
            ? { statutArchivage: "EN_ATTENTE", dateArchivage: null }
            : {}),
        },
      });

      if (numerisationChanged) {
        await tx.numerisation.create({
          data: {
            dossierId,
            operateurId,
            dateDebut: now,
            dateFin: now,
            nombrePages: documentPages || dossier.nombrePages,
            statut: "TERMINEE",
            commentaire: "Validation automatique : au moins un fichier numérique est disponible.",
          },
        });
        await tx.workflowTransition.create({
          data: {
            dossierId,
            workflowType: "NUMERISATION",
            fromStatus: dossier.statutNumerisation,
            toStatus: "TERMINE",
            userId: null,
            commentaire: "Validation automatique après disponibilité d'un fichier.",
          },
        });
      }

      if (indexationChanged) {
        await tx.workflowTransition.create({
          data: {
            dossierId,
            workflowType: "INDEXATION",
            fromStatus: dossier.statutIndexation,
            toStatus: "EN_COURS",
            userId: actorUserId,
            commentaire: trigger === "AJOUT_DOCUMENT"
              ? "Indexation ouverte ou relancée après ajout d'un fichier."
              : "Indexation ouverte après validation automatique de la préparation.",
          },
        });
      }

      if (archivageReopened) {
        await tx.workflowTransition.create({
          data: {
            dossierId,
            workflowType: "ARCHIVAGE",
            fromStatus: dossier.statutArchivage,
            toStatus: "EN_ATTENTE",
            userId: actorUserId,
            commentaire: "Archivage rouvert : un nouveau fichier doit être indexé.",
          },
        });
      }

      await tx.anomalie.updateMany({
        where: {
          dossierId,
          statut: { in: ["OUVERTE", "EN_COURS"] },
          type: "DOCUMENT_MANQUANT",
        },
        data: { statut: "CORRIGEE", corrigePar: actorUserId, corrigeLe: now },
      });
      await tx.qualityCheck.updateMany({
        where: { dossierId, typeControle: "CONTROLE_AUTOMATIQUE_NUMERISATION" },
        data: {
          statut: "CONFORME",
          score: 100,
          commentaire: "Anomalie corrigée : un fichier numérique est maintenant disponible.",
        },
      });
      await tx.dossierHistory.create({
        data: {
          dossierId,
          userId: actorUserId,
          action: indexationChanged ? "INDEXATION_REOUVERTE_DOCUMENT" : "NUMERISATION_AUTOMATIQUE_VALIDEE",
          ancienStatut: dossier.statutIndexation,
          nouveauStatut: indexationChanged ? "EN_COURS" : dossier.statutIndexation,
          commentaire: `${dossier.documents.length} fichier(s) disponible(s) pour la chaîne numérique.`,
        },
      });
    });
  }

  await reconcileDossierIndexation(dossierId, actorUserId);
}

/**
 * Réconcilie le statut global du dossier avec l'état de tous ses fichiers.
 * Tous INDEXE => validation automatique. Une exception terminale => file du
 * superviseur. Tant qu'un worker travaille, le dossier reste EN_COURS.
 */
export async function reconcileDossierIndexation(dossierId: number, actorUserId: number | null) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      statutNumerisation: true,
      statutConditionnement: true,
      statutIndexation: true,
      documents: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          nomOriginal: true,
          automaticIndexStatus: true,
          indexingConfidence: true,
          lastIndexingError: true,
        },
      },
      anomalies: {
        where: {
          statut: { in: ["OUVERTE", "EN_COURS"] },
          champ: { startsWith: "document:" },
        },
        select: { id: true, champ: true },
      },
    },
  });
  if (
    !dossier ||
    dossier.statutNumerisation !== "TERMINE" ||
    dossier.statutConditionnement !== "TERMINE" ||
    dossier.documents.length === 0
  ) return;

  const activeDocuments = dossier.documents.filter((document) =>
    ["A_TRAITER", "EN_FILE", "EN_COURS", "DEUXIEME_LECTURE"].includes(document.automaticIndexStatus),
  );
  const exceptionDocuments = dossier.documents.filter((document) =>
    document.automaticIndexStatus === "A_REQUALIFIER" || document.automaticIndexStatus === "ERREUR",
  );
  const targetStatus = decideDossierIndexationStatus(
    dossier.documents.map((document) => document.automaticIndexStatus),
  );
  if (!targetStatus) return;

  if (dossier.statutIndexation === targetStatus) return;

  const now = new Date();
  const confidences = dossier.documents
    .map((document) => document.indexingConfidence ? Number(document.indexingConfidence) : null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const score = confidences.length > 0
    ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;
  const existingExceptionFields = new Set(dossier.anomalies.map((anomalie) => anomalie.champ));
  const newExceptions = exceptionDocuments.filter(
    (document) => !existingExceptionFields.has(`document:${document.id}`),
  );
  const operateurId = targetStatus === "TERMINE" ? await resolveOperateurForUser(actorUserId) : null;

  await prisma.$transaction(async (tx) => {
    await tx.dossier.update({
      where: { id: dossierId },
      data: {
        statutIndexation: targetStatus,
        dateIndexation: targetStatus === "TERMINE" ? now : null,
      },
    });

    if (targetStatus === "A_VALIDER" && newExceptions.length > 0) {
      await tx.qualityCheck.create({
        data: {
          dossierId,
          userId: null,
          typeControle: "CONTROLE_AUTOMATIQUE_INDEXATION",
          score,
          statut: "A_CORRIGER",
          nombreAnomalies: newExceptions.length,
          commentaire: "Seuls les documents ambigus ou en erreur nécessitent une intervention.",
          anomalies: {
            create: newExceptions.map((document) => ({
              dossierId,
              type: document.automaticIndexStatus === "ERREUR" ? "ERREUR_SAISIE" : "INCOHERENCE",
              champ: `document:${document.id}`,
              gravite: document.automaticIndexStatus === "ERREUR" ? "ELEVEE" : "MOYENNE",
              description: `${document.nomOriginal} : ${document.lastIndexingError ?? "indexation automatique à requalifier"}`,
            })),
          },
        },
      });
    }

    if (targetStatus === "TERMINE") {
      await tx.anomalie.updateMany({
        where: {
          dossierId,
          statut: { in: ["OUVERTE", "EN_COURS"] },
          champ: { startsWith: "document:" },
        },
        data: { statut: "CORRIGEE", corrigePar: actorUserId, corrigeLe: now },
      });
      await tx.qualityCheck.updateMany({
        where: { dossierId, typeControle: "CONTROLE_AUTOMATIQUE_INDEXATION" },
        data: {
          statut: "CONFORME",
          score,
          commentaire: "Exceptions corrigées : tous les fichiers sont désormais indexés.",
        },
      });
      await tx.indexation.create({
        data: {
          dossierId,
          operateurId,
          dateDebut: now,
          dateFin: now,
          statut: "TERMINEE",
          scoreQualite: score,
          commentaire: "Indexation validée automatiquement après contrôle de tous les fichiers.",
        },
      });
    }

    await tx.workflowTransition.create({
      data: {
        dossierId,
        workflowType: "INDEXATION",
        fromStatus: dossier.statutIndexation,
        toStatus: targetStatus,
        userId: null,
        commentaire: targetStatus === "TERMINE"
          ? "Tous les fichiers sont indexés et conformes."
          : targetStatus === "A_VALIDER"
            ? `${exceptionDocuments.length} fichier(s) à examiner.`
            : `${activeDocuments.length} fichier(s) encore en traitement.`,
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId,
        userId: null,
        action: targetStatus === "TERMINE"
          ? "INDEXATION_AUTOMATIQUE_DOSSIER_VALIDEE"
          : targetStatus === "A_VALIDER"
            ? "INDEXATION_EXCEPTION_SUPERVISEUR"
            : "INDEXATION_AUTOMATIQUE_EN_COURS",
        ancienStatut: dossier.statutIndexation,
        nouveauStatut: targetStatus,
        commentaire: targetStatus === "A_VALIDER"
          ? `${exceptionDocuments.length} document(s) nécessitent une requalification.`
          : undefined,
        metadata: { documents: dossier.documents.length, score },
      },
    });
  });
}
