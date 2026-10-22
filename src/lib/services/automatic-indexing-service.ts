import "server-only";

import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { getStorageProvider } from "@/lib/storage";
import { ApiError } from "@/lib/utils/api-error";
import { getClientIp } from "@/lib/utils/server-request";
import { getTypePieceSuggestionScore, normalizeTypePieceText } from "@/lib/utils/type-piece-normalization";
import { extractDocumentText, OcrUnavailableError } from "@/lib/indexing/ocr-service";
import {
  buildClassificationPath,
  buildDocumentSearchText,
  extractConfiguredValues,
  mergeDossierValues,
  type DossierIndexContext,
} from "@/lib/indexing/indexing-utils";

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

function publicIndexingError(error: unknown): string {
  if (error instanceof OcrUnavailableError) {
    return `${error.message} Vérifiez l'image de déploiement OCR de GeoArchives.`;
  }
  if (error instanceof Error) return error.message.slice(0, 1000);
  return "L'indexation automatique a échoué pour une raison inconnue.";
}

async function assertAutomaticIndexAccess(documentId: number, session: Awaited<ReturnType<typeof requireApiPermission>>) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      dossier: {
        include: {
          site: { select: { nom: true } },
          entrepot: { select: { nom: true } },
          commune: { select: { nom: true } },
          lotissement: { select: { nom: true } },
          natureDossier: { select: { libelle: true } },
        },
      },
    },
  });
  if (!document) throw new ApiError("Document introuvable.", 404);
  if (
    (session.roleCode === "OPERATEUR" || session.roleCode === "SUPERVISEUR") &&
    !(await isOperateurInScope(session, document.dossier.operateurId))
  ) {
    throw new ApiError("Document introuvable.", 404);
  }
  if (document.dossier.statutArchivage === "TERMINE") {
    throw new ApiError("Un document archivé ne peut plus être réindexé.", 409);
  }
  return document;
}

function dossierContext(document: Awaited<ReturnType<typeof assertAutomaticIndexAccess>>): DossierIndexContext {
  const dossier = document.dossier;
  return {
    reference: dossier.reference,
    site: dossier.site?.nom,
    entrepot: dossier.entrepot?.nom,
    commune: dossier.commune?.nom,
    lotissement: dossier.lotissement?.nom,
    natureDossier: dossier.natureDossier?.libelle,
    titulaire: [dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || null,
    numeroLot: dossier.numeroLot,
    numeroIlot: dossier.numeroIlot,
    numeroTitreFoncier: dossier.numeroTitreFoncier,
    directionService: dossier.numeroDdu,
    codeBarres: dossier.codeBarres,
  };
}

function findTypePiece(
  text: string,
  originalName: string,
  typesPiece: Array<{ id: number; libelle: string }>,
): { id: number; libelle: string } | null {
  const normalizedText = normalizeTypePieceText(`${originalName}\n${text.slice(0, 80_000)}`);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 500);
  let best: { id: number; libelle: string; score: number } | null = null;

  for (const type of typesPiece) {
    const normalizedLabel = normalizeTypePieceText(type.libelle);
    let score = normalizedLabel && normalizedText.includes(normalizedLabel) ? 100 : 0;
    score = Math.max(score, getTypePieceSuggestionScore(originalName, type.libelle));
    for (const line of lines) score = Math.max(score, getTypePieceSuggestionScore(line, type.libelle));
    if (score >= 60 && (!best || score > best.score)) best = { ...type, score };
  }
  return best ? { id: best.id, libelle: best.libelle } : null;
}

export async function rebuildDocumentSearchText(documentId: number) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      typePiece: { select: { libelle: true } },
      indexValues: { include: { field: { select: { isSearchable: true } } } },
    },
  });
  if (!document) return;
  const searchText = buildDocumentSearchText({
    extractedText: document.extractedText,
    originalName: document.nomOriginal,
    title: document.titreIndexation,
    reference: document.referenceIndexation,
    typePiece: document.typePiece?.libelle,
    classificationPath: document.classificationPath,
    values: document.indexValues.map((value) => ({ value: value.value, searchable: value.field.isSearchable })),
  });
  await prisma.document.update({ where: { id: documentId }, data: { searchText } });
}

export async function runAutomaticIndexing(documentId: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const document = await assertAutomaticIndexAccess(documentId, session);

  const claimed = await prisma.document.updateMany({
    where: { id: documentId, automaticIndexStatus: { not: "EN_COURS" } },
    data: { automaticIndexStatus: "EN_COURS", lastIndexingError: null },
  });
  if (claimed.count === 0) throw new ApiError("Ce document est déjà en cours d'indexation.", 409);

  const run = await prisma.documentIndexingRun.create({
    data: { documentId, triggeredBy: session.userId, status: "EN_COURS", engine: "local-auto" },
  });

  try {
    const storage = getStorageProvider(document.storageProvider);
    const buffer = await storage.read(sourceReference(document));
    const [extraction, fields, typesPiece, existingValues] = await Promise.all([
      extractDocumentText(buffer, document.typeMime),
      prisma.indexingField.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
      prisma.typePiece.findMany({ where: { isActive: true }, select: { id: true, libelle: true } }),
      prisma.documentIndexValue.findMany({ where: { documentId }, select: { fieldId: true, source: true, validated: true } }),
    ]);

    const context = dossierContext(document);
    const extracted = mergeDossierValues(extractConfiguredValues(extraction.text, fields), fields, context);
    const titleField = fields.find((field) => field.key === "document_title");
    if (titleField && !extracted.some((value) => value.fieldId === titleField.id)) {
      const fallbackTitle = path.parse(document.nomOriginal).name;
      extracted.push({
        fieldId: titleField.id,
        key: titleField.key,
        value: fallbackTitle,
        rawValue: fallbackTitle,
        confidence: 70,
        source: "DOSSIER",
      });
    }
    const classificationPath = buildClassificationPath(context);
    const typePiece = findTypePiece(extraction.text, document.nomOriginal, typesPiece);
    const byKey = new Map(extracted.map((value) => [value.key, value]));
    const title = byKey.get("document_title")?.value || path.parse(document.nomOriginal).name;
    const reference = byKey.get("business_reference")?.value || document.dossier.reference;
    const dateValue = byKey.get("document_date")?.value;
    const dateDocument = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? new Date(`${dateValue}T00:00:00.000Z`)
      : document.dateDocument;
    const coverage = fields.length > 0 ? extracted.length / fields.length : 0;
    const confidence = Math.min(100, Math.round((extraction.baseConfidence * 0.7 + coverage * 30) * 100) / 100);
    const protectedFields = new Set(
      existingValues.filter((value) => value.source === "MANUAL" && value.validated).map((value) => value.fieldId),
    );

    await prisma.$transaction(async (tx) => {
      for (const value of extracted) {
        if (protectedFields.has(value.fieldId)) continue;
        await tx.documentIndexValue.upsert({
          where: { documentId_fieldId: { documentId, fieldId: value.fieldId } },
          create: {
            documentId,
            fieldId: value.fieldId,
            value: value.value,
            rawValue: value.rawValue,
            confidence: new Prisma.Decimal(value.confidence),
            source: value.source,
            validated: false,
          },
          update: {
            value: value.value,
            rawValue: value.rawValue,
            confidence: new Prisma.Decimal(value.confidence),
            source: value.source,
            validated: false,
          },
        });
      }

      const searchableValues = extracted.map((value) => ({
        value: value.value,
        searchable: fields.find((field) => field.id === value.fieldId)?.isSearchable ?? true,
      }));
      const searchText = buildDocumentSearchText({
        extractedText: extraction.text,
        originalName: document.nomOriginal,
        title,
        reference,
        typePiece: typePiece?.libelle,
        classificationPath,
        values: searchableValues,
      });

      await tx.document.update({
        where: { id: documentId },
        data: {
          automaticIndexStatus: "A_VERIFIER",
          extractedText: extraction.text,
          searchText,
          indexingConfidence: new Prisma.Decimal(confidence),
          classificationPath,
          indexedAt: new Date(),
          lastIndexingError: null,
          titreIndexation: document.titreIndexation || title,
          referenceIndexation: document.referenceIndexation || reference,
          dateDocument,
          nombrePages: document.nombrePages ?? extraction.pageCount,
          typePieceId: document.typePieceId ?? typePiece?.id ?? null,
          preIndexStatus: document.preIndexStatus === "PRET" ? "PRET" : "BROUILLON",
        },
      });
      await tx.documentIndexingRun.update({
        where: { id: run.id },
        data: {
          status: "A_VERIFIER",
          engine: extraction.engine,
          extractedFields: extracted.map(({ fieldId, key, value, confidence: fieldConfidence, source }) => ({ fieldId, key, value, confidence: fieldConfidence, source })),
          extractedTextSize: extraction.text.length,
          confidence: new Prisma.Decimal(confidence),
          completedAt: new Date(),
        },
      });
      await tx.dossierHistory.create({
        data: {
          dossierId: document.dossierId,
          userId: session.userId,
          action: "INDEXATION_AUTOMATIQUE",
          commentaire: `${document.nomOriginal} : ${extracted.length} champ(s) proposé(s), confiance ${confidence} %`,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "DOCUMENT_AUTO_INDEX",
          entity: "DOCUMENT",
          entityId: documentId,
          newValue: { engine: extraction.engine, extractedFields: extracted.length, confidence, classificationPath },
          ipAddress: await getClientIp(),
        },
      });
    });

    return { documentId, status: "A_VERIFIER" as const, fields: extracted.length, confidence, engine: extraction.engine };
  } catch (error) {
    const message = publicIndexingError(error);
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { automaticIndexStatus: "ERREUR", lastIndexingError: message },
      }),
      prisma.documentIndexingRun.update({
        where: { id: run.id },
        data: { status: "ERREUR", error: message, completedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: "DOCUMENT_AUTO_INDEX_ERROR",
          entity: "DOCUMENT",
          entityId: documentId,
          newValue: { error: message },
        },
      }),
    ]);
    throw new ApiError(message, error instanceof OcrUnavailableError ? 503 : 422);
  }
}

export async function runDossierAutomaticIndexing(dossierId: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: { id: true, operateurId: true, statutArchivage: true, documents: { select: { id: true }, orderBy: { id: "asc" } } },
  });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);
  if (
    (session.roleCode === "OPERATEUR" || session.roleCode === "SUPERVISEUR") &&
    !(await isOperateurInScope(session, dossier.operateurId))
  ) {
    throw new ApiError("Dossier introuvable.", 404);
  }
  if (dossier.statutArchivage === "TERMINE") throw new ApiError("Un dossier archivé ne peut plus être réindexé.", 409);
  if (dossier.documents.length === 0) throw new ApiError("Ajoutez au moins un fichier numérisé avant l'indexation.");

  const results: Array<
    | { success: true; documentId: number; status: "A_VERIFIER"; fields: number; confidence: number; engine: string }
    | { success: false; documentId: number; error: string }
  > = [];
  for (const document of dossier.documents) {
    try {
      results.push({ success: true, ...(await runAutomaticIndexing(document.id)) });
    } catch (error) {
      results.push({ success: false, documentId: document.id, error: publicIndexingError(error) });
    }
  }
  return {
    total: results.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}
