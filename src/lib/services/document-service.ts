import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { prisma } from "@/lib/prisma/client";
import { requirePermission, requireApiPermission } from "@/lib/auth/current-user";
import { getStorageProvider } from "@/lib/storage";
import { getClientIp } from "@/lib/utils/server-request";
import type { SessionPayload } from "@/lib/auth/session";
import { ApiError } from "@/lib/utils/api-error";
import { isOperateurInScope } from "@/lib/services/access-scope";

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
async function assertDossierAccessible(dossierId: number, session: SessionPayload) {
  const dossier = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { id: true, operateurId: true } });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);

  if (session.roleCode === "OPERATEUR" || session.roleCode === "SUPERVISEUR") {
    if (!(await isOperateurInScope(session, dossier.operateurId))) {
      throw new ApiError("Dossier introuvable.", 404);
    }
  }
  return dossier;
}

export async function uploadDocument(dossierId: number, file: File) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  await assertDossierAccessible(dossierId, session);

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
  const { url } = await storage.save(storageKey, buffer);

  const document = await prisma.document.create({
    data: {
      dossierId,
      nomFichier: storageKey,
      nomOriginal: file.name,
      typeMime: file.type,
      extension,
      taille: file.size,
      url,
      storageProvider: "LOCAL",
      hash,
      uploadedBy: session.userId,
    },
  });

  await prisma.dossierHistory.create({
    data: {
      dossierId,
      userId: session.userId,
      action: "DOCUMENT_AJOUTE",
      commentaire: `${file.name} (${(file.size / 1024).toFixed(0)} Ko)`,
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOCUMENT_UPLOAD",
      entity: "DOCUMENT",
      entityId: document.id,
      newValue: { dossierId, nomOriginal: file.name, taille: file.size },
      ipAddress: await getClientIp(),
    },
  });

  return document;
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

  const storage = getStorageProvider();
  const buffer = await storage.read(document.nomFichier);

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

export async function deleteDocument(documentId: number) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) throw new ApiError("Document introuvable.", 404);
  await assertDossierAccessible(document.dossierId, session);

  const storage = getStorageProvider();
  await storage.remove(document.nomFichier);
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
