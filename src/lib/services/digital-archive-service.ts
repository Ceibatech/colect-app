import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { getStorageProvider } from "@/lib/storage";
import {
  AlfrescoArchiveClient,
  AlfrescoArchiveError,
  isAlfrescoDigitalArchiveEnabled,
} from "@/lib/archive/alfresco-client";
import { ApiError } from "@/lib/utils/api-error";
import { getClientIp } from "@/lib/utils/server-request";

interface ArchiveSummary {
  total: number;
  archived: number;
  failed: number;
  skipped: number;
}

function sourceReference(document: {
  nomFichier: string;
  externalDriveId: string | null;
  externalItemId: string | null;
}) {
  return {
    key: document.nomFichier,
    externalDriveId: document.externalDriveId,
    externalItemId: document.externalItemId,
  };
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof AlfrescoArchiveError) return error.message.slice(0, 1000);
  if (error instanceof Error) return `Le versement a échoué : ${error.message}`.slice(0, 1000);
  return "Le versement a échoué pour une raison inconnue.";
}

async function markDocumentsAsFailed(dossierId: number, message: string) {
  await prisma.document.updateMany({
    where: {
      dossierId,
      preIndexStatus: "PRET",
      digitalArchiveStatus: { not: "ARCHIVE" },
    },
    data: {
      digitalArchiveStatus: "ERREUR",
      alfrescoArchiveError: message,
      lastArchiveAttemptAt: new Date(),
    },
  });
}

export async function processDossierDigitalArchive(
  dossierId: number,
  actorUserId: number,
): Promise<ArchiveSummary> {
  if (!isAlfrescoDigitalArchiveEnabled()) {
    return { total: 0, archived: 0, failed: 0, skipped: 0 };
  }

  const documents = await prisma.document.findMany({
    where: {
      dossierId,
      preIndexStatus: "PRET",
      digitalArchiveStatus: { not: "ARCHIVE" },
    },
    include: {
      dossier: { select: { reference: true } },
    },
    orderBy: { id: "asc" },
  });

  let client: AlfrescoArchiveClient;
  try {
    client = new AlfrescoArchiveClient();
  } catch (error) {
    const message = publicErrorMessage(error);
    await markDocumentsAsFailed(dossierId, message);
    return { total: documents.length, archived: 0, failed: documents.length, skipped: 0 };
  }

  const summary: ArchiveSummary = { total: documents.length, archived: 0, failed: 0, skipped: 0 };

  for (const document of documents) {
    const claimed = await prisma.document.updateMany({
      where: {
        id: document.id,
        digitalArchiveStatus: { in: ["EN_ATTENTE", "ERREUR", "NON_REQUIS"] },
      },
      data: {
        digitalArchiveStatus: "EN_COURS",
        alfrescoArchiveError: null,
        alfrescoArchiveAttempts: { increment: 1 },
        lastArchiveAttemptAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      summary.skipped += 1;
      continue;
    }

    try {
      const source = getStorageProvider(document.storageProvider);
      const buffer = await source.read(sourceReference(document));
      const calculatedHash = createHash("sha256").update(buffer).digest("hex");
      if (!document.hash || calculatedHash !== document.hash) {
        throw new AlfrescoArchiveError(
          "Empreinte SHA-256 incohérente : le fichier source n'a pas été versé.",
        );
      }

      const result = await client.archiveDocument({
        dossierReference: document.dossier.reference,
        documentId: document.id,
        originalName: document.nomOriginal,
        title: document.titreIndexation,
        businessReference:
          document.referenceIndexation?.trim() || `${document.dossier.reference}/DOC-${document.id}`,
        hash: calculatedHash,
        contentType: document.typeMime,
        buffer,
      });

      await prisma.$transaction([
        prisma.document.update({
          where: { id: document.id },
          data: {
            digitalArchiveStatus: "ARCHIVE",
            alfrescoNodeId: result.nodeId,
            alfrescoWebUrl: result.webUrl,
            alfrescoArchivedAt: new Date(),
            alfrescoArchiveError: null,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: actorUserId,
            action: "DOCUMENT_ALFRESCO_ARCHIVE",
            entity: "DOCUMENT",
            entityId: document.id,
            newValue: {
              dossierId,
              alfrescoNodeId: result.nodeId,
              hash: calculatedHash,
            },
          },
        }),
      ]);
      summary.archived += 1;
    } catch (error) {
      const message = publicErrorMessage(error);
      await prisma.$transaction([
        prisma.document.update({
          where: { id: document.id },
          data: {
            digitalArchiveStatus: "ERREUR",
            alfrescoArchiveError: message,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: actorUserId,
            action: "DOCUMENT_ALFRESCO_ERROR",
            entity: "DOCUMENT",
            entityId: document.id,
            newValue: { dossierId, error: message },
          },
        }),
      ]);
      summary.failed += 1;
    }
  }

  if (summary.total > 0) {
    await prisma.dossierHistory.create({
      data: {
        dossierId,
        userId: actorUserId,
        action: summary.failed > 0 ? "ARCHIVAGE_NUMERIQUE_PARTIEL" : "ARCHIVAGE_NUMERIQUE_TERMINE",
        commentaire: `${summary.archived} document(s) archivé(s), ${summary.failed} en erreur.`,
      },
    });
  }

  return summary;
}

export async function requestDigitalArchiveRetry(dossierId: number) {
  const session = await requireApiPermission("ARCHIVAGE_VALIDATE");
  if (!isAlfrescoDigitalArchiveEnabled()) {
    throw new ApiError("L'archivage numérique Alfresco n'est pas activé sur ce serveur.", 503);
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { id: true, operateurId: true, statutArchivage: true },
  });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);
  if (
    (session.roleCode === "OPERATEUR" || session.roleCode === "SUPERVISEUR") &&
    !(await isOperateurInScope(session, dossier.operateurId))
  ) {
    throw new ApiError("Dossier introuvable.", 404);
  }
  if (dossier.statutArchivage !== "TERMINE") {
    throw new ApiError("Le dossier doit être validé et archivé avant le versement Alfresco.");
  }

  const queued = await prisma.document.updateMany({
    where: {
      dossierId,
      preIndexStatus: "PRET",
      digitalArchiveStatus: { not: "ARCHIVE" },
    },
    data: {
      digitalArchiveStatus: "EN_ATTENTE",
      alfrescoArchiveError: null,
    },
  });

  if (queued.count > 0) {
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "ALFRESCO_ARCHIVE_RETRY",
        entity: "DOSSIER",
        entityId: dossierId,
        newValue: { queued: queued.count },
        ipAddress: await getClientIp(),
      },
    });
  }

  return { queued: queued.count, actorUserId: session.userId };
}
