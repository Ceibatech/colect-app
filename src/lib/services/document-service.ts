import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma/client";
import { requirePermission, requireApiPermission } from "@/lib/auth/current-user";
import { getStorageProvider } from "@/lib/storage";
import { SharePointStorageError } from "@/lib/storage/sharepoint-storage-provider";
import { getClientIp } from "@/lib/utils/server-request";
import type { SessionPayload } from "@/lib/auth/session";
import { ApiError } from "@/lib/utils/api-error";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { documentPreindexSchema } from "@/lib/validation/document-preindex";
import { rebuildDocumentSearchText } from "@/lib/services/automatic-indexing-service";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
]);

/**
 * L'ajout/suppression de documents est rattaché à `NUMERISATION_UPDATE`
 * (aucune permission `DOCUMENT_*` dédiée au cahier des charges §12) — c'est
 * l'opérateur qui numérise qui dépose le fichier scanné. La consultation
 * suit `DOSSIER_READ`, déjà requis pour atteindre la fiche dossier.
 */
async function assertDossierAccessible(
  dossierId: number,
  session: SessionPayload,
  options?: { requireMutable?: boolean },
) {
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { id: true, operateurId: true, statutArchivage: true },
  });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);

  if (session.roleCode === "OPERATEUR" || session.roleCode === "SUPERVISEUR") {
    if (!(await isOperateurInScope(session, dossier.operateurId))) {
      throw new ApiError("Dossier introuvable.", 404);
    }
  }
  if (options?.requireMutable && dossier.statutArchivage === "TERMINE") {
    throw new ApiError("Les documents d'un dossier archivé ne peuvent plus être modifiés.", 409);
  }
  return dossier;
}

function storageReference(document: {
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

function throwStorageApiError(error: unknown): never {
  if (error instanceof SharePointStorageError) {
    throw new ApiError(`Stockage SharePoint indisponible. ${error.message}`, 502);
  }
  throw error;
}

export async function uploadDocument(dossierId: number, file: File) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  await assertDossierAccessible(dossierId, session, { requireMutable: true });

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ApiError("Type de fichier non autorisé (PDF, JPEG, PNG, TIFF uniquement).");
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new ApiError("Fichier trop volumineux (20 Mo maximum).");
  }
  if (file.size === 0) {
    throw new ApiError("Fichier vide.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  const extension = path.extname(file.name).replace(".", "").toLowerCase() || "bin";
  const storageKey = `${dossierId}/${randomUUID()}.${extension}`;

  const storage = getStorageProvider();
  let stored;
  try {
    stored = await storage.save(storageKey, buffer, { contentType: file.type });
  } catch (error) {
    throwStorageApiError(error);
  }

  try {
    const ipAddress = await getClientIp();
    return await prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          dossierId,
          nomFichier: storageKey,
          nomOriginal: file.name,
          typeMime: file.type,
          extension,
          taille: file.size,
          url: stored.url,
          storageProvider: storage.kind,
          hash,
          externalDriveId: stored.externalDriveId,
          externalItemId: stored.externalItemId,
          externalWebUrl: stored.externalWebUrl,
          uploadedBy: session.userId,
        },
      });
      await tx.documentIndexingJob.create({
        data: { documentId: document.id, requestedBy: session.userId },
      });
      await tx.document.update({
        where: { id: document.id },
        data: { automaticIndexStatus: "EN_FILE" },
      });
      await tx.dossierHistory.create({
        data: {
          dossierId,
          userId: session.userId,
          action: "DOCUMENT_AJOUTE",
          commentaire: `${file.name} (${(file.size / 1024).toFixed(0)} Ko) — ${storage.kind}`,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "DOCUMENT_UPLOAD",
          entity: "DOCUMENT",
          entityId: document.id,
          newValue: { dossierId, nomOriginal: file.name, taille: file.size, storageProvider: storage.kind },
          ipAddress,
        },
      });
      return { ...document, automaticIndexStatus: "EN_FILE" as const };
    });
  } catch (error) {
    try {
      await storage.remove({
        key: storageKey,
        externalDriveId: stored.externalDriveId,
        externalItemId: stored.externalItemId,
      });
    } catch {
      // La transaction reste l'erreur principale ; le fichier orphelin pourra être rapproché par son hash.
    }
    throw error;
  }
}

export async function listDocuments(dossierId: number) {
  const session = await requirePermission("DOSSIER_READ");
  await assertDossierAccessible(dossierId, session);
  return prisma.document.findMany({ where: { dossierId }, orderBy: { createdAt: "desc" } });
}

export async function getDocumentForDownload(documentId: number) {
  const session = await requireApiPermission("DOSSIER_READ");
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new ApiError("Document introuvable.", 404);
  await assertDossierAccessible(document.dossierId, session);

  const storage = getStorageProvider(document.storageProvider);
  let buffer: Buffer;
  try {
    buffer = await storage.read(storageReference(document));
  } catch (error) {
    throwStorageApiError(error);
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOCUMENT_DOWNLOAD",
      entity: "DOCUMENT",
      entityId: document.id,
      ipAddress: await getClientIp(),
    },
  });

  return { document, buffer };
}

export async function getDocumentDerivativeForDownload(documentId: number, derivativeId: number) {
  const session = await requireApiPermission("DOSSIER_READ");
  const derivative = await prisma.documentDerivative.findFirst({
    where: { id: derivativeId, documentId },
    include: { document: { select: { dossierId: true, nomOriginal: true } } },
  });
  if (!derivative) throw new ApiError("Dérivé documentaire introuvable.", 404);
  await assertDossierAccessible(derivative.document.dossierId, session);
  const storage = getStorageProvider(derivative.storageProvider);
  const buffer = await storage.read({
    key: derivative.storageKey,
    externalDriveId: derivative.externalDriveId,
    externalItemId: derivative.externalItemId,
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOCUMENT_DERIVATIVE_DOWNLOAD",
      entity: "DOCUMENT",
      entityId: documentId,
      newValue: { derivativeId, kind: derivative.kind },
      ipAddress: await getClientIp(),
    },
  });
  return { derivative, originalName: derivative.document.nomOriginal, buffer };
}

export async function deleteDocument(documentId: number) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new ApiError("Document introuvable.", 404);
  await assertDossierAccessible(document.dossierId, session, { requireMutable: true });

  const storage = getStorageProvider(document.storageProvider);
  try {
    await storage.remove(storageReference(document));
  } catch (error) {
    throwStorageApiError(error);
  }
  await prisma.document.delete({ where: { id: documentId } });

  await prisma.dossierHistory.create({
    data: {
      dossierId: document.dossierId,
      userId: session.userId,
      action: "DOCUMENT_SUPPRIME",
      commentaire: document.nomOriginal,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOCUMENT_DELETE",
      entity: "DOCUMENT",
      entityId: documentId,
      oldValue: { nomOriginal: document.nomOriginal, dossierId: document.dossierId },
      ipAddress: await getClientIp(),
    },
  });
}

export async function preindexDocument(documentId: number, values: unknown) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const parsed = documentPreindexSchema.safeParse(values);
  if (!parsed.success) {
    throw new ApiError(parsed.error.issues[0]?.message ?? "Métadonnées de pré-indexation invalides.");
  }

  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new ApiError("Document introuvable.", 404);
  await assertDossierAccessible(document.dossierId, session, { requireMutable: true });

  if (parsed.data.typePieceId) {
    const typePiece = await prisma.typePiece.findFirst({
      where: { id: parsed.data.typePieceId, isActive: true },
      select: { id: true },
    });
    if (!typePiece) throw new ApiError("Type de pièce introuvable ou inactif.");
  }

  const indexingFields = parsed.data.indexValues.length > 0 || parsed.data.ready
    ? await prisma.indexingField.findMany({
        where: { isActive: true },
        select: { id: true, label: true, isRequired: true },
      })
    : [];
  const allowedFieldIds = new Set(indexingFields.map((field) => field.id));
  if (parsed.data.indexValues.some((value) => !allowedFieldIds.has(value.fieldId))) {
    throw new ApiError("Un champ d'indexation est introuvable ou inactif.");
  }
  if (parsed.data.ready) {
    const supplied = new Map(parsed.data.indexValues.map((value) => [value.fieldId, value.value.trim()]));
    const missing = indexingFields.filter((field) => field.isRequired && !supplied.get(field.id));
    if (missing.length > 0) {
      throw new ApiError(`Champ d'indexation requis : ${missing.map((field) => field.label).join(", ")}.`);
    }
  }

  const preIndexStatus = parsed.data.ready ? "PRET" : "BROUILLON";
  const dateDocument = parsed.data.dateDocument
    ? new Date(`${parsed.data.dateDocument}T00:00:00.000Z`)
    : null;
  const ipAddress = await getClientIp();

  const updated = await prisma.$transaction(async (tx) => {
    for (const indexValue of parsed.data.indexValues) {
      if (!indexValue.value.trim()) {
        await tx.documentIndexValue.deleteMany({ where: { documentId, fieldId: indexValue.fieldId } });
        continue;
      }
      await tx.documentIndexValue.upsert({
        where: { documentId_fieldId: { documentId, fieldId: indexValue.fieldId } },
        create: {
          documentId,
          fieldId: indexValue.fieldId,
          value: indexValue.value.trim(),
          rawValue: indexValue.value.trim(),
          source: "MANUAL",
          confidence: 100,
          validated: true,
        },
        update: {
          value: indexValue.value.trim(),
          source: "MANUAL",
          confidence: 100,
          validated: true,
        },
      });
    }
    const updated = await tx.document.update({
      where: { id: documentId },
      data: {
        titreIndexation: parsed.data.titreIndexation,
        referenceIndexation: parsed.data.referenceIndexation,
        dateDocument,
        nombrePages: parsed.data.nombrePages ?? null,
        typePieceId: parsed.data.typePieceId ?? null,
        preIndexNotes: parsed.data.preIndexNotes,
        preIndexStatus,
        preIndexedBy: session.userId,
        preIndexedAt: new Date(),
        automaticIndexStatus: parsed.data.ready ? "INDEXE" : document.automaticIndexStatus,
        indexedAt: parsed.data.ready ? new Date() : document.indexedAt,
        lastIndexingError: null,
      },
      include: {
        typePiece: { select: { id: true, libelle: true } },
        preIndexer: { select: { name: true } },
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: document.dossierId,
        userId: session.userId,
        action: parsed.data.ready ? "DOCUMENT_PREINDEXE" : "DOCUMENT_PREINDEX_BROUILLON",
        commentaire: parsed.data.titreIndexation ?? document.nomOriginal,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "DOCUMENT_PREINDEX",
        entity: "DOCUMENT",
        entityId: documentId,
        newValue: {
          preIndexStatus,
          titreIndexation: parsed.data.titreIndexation,
          referenceIndexation: parsed.data.referenceIndexation,
          dateDocument: parsed.data.dateDocument,
          nombrePages: parsed.data.nombrePages ?? null,
          typePieceId: parsed.data.typePieceId ?? null,
        },
        ipAddress,
      },
    });
    return updated;
  });
  await rebuildDocumentSearchText(documentId);
  return updated;
}
