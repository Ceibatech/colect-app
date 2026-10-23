import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { Prisma, type IndexingPass } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { getStorageProvider } from "@/lib/storage";
import { ApiError } from "@/lib/utils/api-error";
import { getClientIp } from "@/lib/utils/server-request";
import { getTypePieceSuggestionScore, normalizeTypePieceText } from "@/lib/utils/type-piece-normalization";
import {
  buildClassificationPath,
  buildDocumentSearchText,
  extractConfiguredValues,
  mergeDossierValues,
  normalizeIndexValue,
  type DossierIndexContext,
  type ExtractedIndexValue,
  type IndexingFieldDefinition,
} from "@/lib/indexing/indexing-utils";
import {
  decideAutomaticIndexing,
  harmonizeIndexValue,
  validateIndexingRules,
} from "@/lib/indexing/indexing-policy";
import type { z } from "zod";
import type { indexingWorkerFailureSchema, indexingWorkerResultSchema } from "@/lib/validation/indexing-worker";
import { reconcileDossierIndexation } from "@/lib/services/workflow-automation-service";

type WorkerResult = z.infer<typeof indexingWorkerResultSchema>;
type WorkerFailure = z.infer<typeof indexingWorkerFailureSchema>;

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

async function assertAutomaticIndexAccess(
  documentId: number,
  session: Awaited<ReturnType<typeof requireApiPermission>>,
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { dossier: { select: { operateurId: true, statutArchivage: true } } },
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

function dossierContext(document: {
  dossier: {
    reference: string;
    site: { nom: string } | null;
    entrepot: { nom: string } | null;
    commune: { nom: string } | null;
    lotissement: { nom: string } | null;
    natureDossier: { libelle: string } | null;
    nom: string | null;
    prenoms: string | null;
    numeroLot: string | null;
    numeroIlot: string | null;
    numeroTitreFoncier: string | null;
    numeroDdu: string | null;
    codeBarres: string | null;
  };
}): DossierIndexContext {
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

async function enqueueDocument(
  documentId: number,
  requestedBy: number | null,
  analysisPass: IndexingPass = "PRINCIPALE",
) {
  return prisma.$transaction(async (tx) => {
    const active = await tx.documentIndexingJob.findFirst({
      where: { documentId, status: { in: ["EN_ATTENTE", "EN_COURS"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (active) return { jobId: active.id, queued: false, status: active.status };

    const job = await tx.documentIndexingJob.create({
      data: { documentId, requestedBy, analysisPass },
    });
    await tx.document.update({
      where: { id: documentId },
      data: {
        automaticIndexStatus: analysisPass === "PRINCIPALE" ? "EN_FILE" : "DEUXIEME_LECTURE",
        lastIndexingError: null,
      },
    });
    return { jobId: job.id, queued: true, status: job.status };
  });
}

export async function queueDocumentAutomaticIndexing(documentId: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  await assertAutomaticIndexAccess(documentId, session);
  const result = await enqueueDocument(documentId, session.userId);
  if (result.queued) {
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "DOCUMENT_AUTO_INDEX_QUEUED",
        entity: "DOCUMENT",
        entityId: documentId,
        newValue: { jobId: result.jobId },
        ipAddress: await getClientIp(),
      },
    });
  }
  return result;
}

export async function queueDossierAutomaticIndexing(dossierId: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const dossier = await prisma.dossier.findUnique({
    where: { id: dossierId },
    select: {
      id: true,
      operateurId: true,
      statutArchivage: true,
      documents: { select: { id: true }, orderBy: { id: "asc" } },
    },
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

  const results = [];
  for (const document of dossier.documents) {
    results.push({ documentId: document.id, ...(await enqueueDocument(document.id, session.userId)) });
  }
  return {
    total: results.length,
    queued: results.filter((result) => result.queued).length,
    alreadyQueued: results.filter((result) => !result.queued).length,
    results,
  };
}

export async function enqueueUploadedDocument(documentId: number, requestedBy: number | null) {
  return enqueueDocument(documentId, requestedBy);
}

async function recoverStaleIndexingJobs() {
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000);
  const staleJobs = await prisma.documentIndexingJob.findMany({
    where: { status: "EN_COURS", lockedAt: { lt: staleBefore } },
    orderBy: { lockedAt: "asc" },
    take: 100,
    select: {
      id: true,
      documentId: true,
      analysisPass: true,
      attempts: true,
      maxAttempts: true,
      lockedAt: true,
    },
  });

  for (const job of staleJobs) {
    const terminal = job.attempts >= job.maxAttempts;
    const message = terminal
      ? "Le worker a interrompu la dernière tentative d'indexation."
      : "Verrou worker expiré, travail remis en file.";
    await prisma.$transaction(async (tx) => {
      const recovered = await tx.documentIndexingJob.updateMany({
        where: { id: job.id, status: "EN_COURS", lockedAt: job.lockedAt },
        data: terminal
          ? { status: "ERREUR", completedAt: new Date(), error: message }
          : { status: "EN_ATTENTE", lockedAt: null, workerId: null, availableAt: new Date(), error: message },
      });
      if (recovered.count === 0) return;
      await tx.document.update({
        where: { id: job.documentId },
        data: {
          automaticIndexStatus: terminal
            ? "ERREUR"
            : job.analysisPass === "PRINCIPALE"
              ? "EN_FILE"
              : "DEUXIEME_LECTURE",
          lastIndexingError: message,
        },
      });
    });
  }
}

export async function claimNextIndexingJob(workerId: string) {
  await recoverStaleIndexingJobs();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.documentIndexingJob.findFirst({
      where: { status: "EN_ATTENTE", availableAt: { lte: new Date() }, attempts: { lt: 3 } },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!candidate) return null;
    const claimed = await prisma.documentIndexingJob.updateMany({
      where: { id: candidate.id, status: "EN_ATTENTE" },
      data: { status: "EN_COURS", lockedAt: new Date(), workerId, attempts: { increment: 1 }, error: null },
    });
    if (claimed.count === 0) continue;

    const job = await prisma.documentIndexingJob.findUnique({
      where: { id: candidate.id },
      include: {
        document: {
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
        },
      },
    });
    if (!job) return null;
    await prisma.document.update({ where: { id: job.documentId }, data: { automaticIndexStatus: "EN_COURS" } });
    const fields = await prisma.indexingField.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return {
      id: job.id,
      analysisPass: job.analysisPass,
      attempts: job.attempts,
      document: {
        id: job.document.id,
        originalName: job.document.nomOriginal,
        mimeType: job.document.typeMime,
        downloadPath: `/api/internal/indexing/jobs/${job.id}/document`,
      },
      fields: fields.map((field) => ({
        key: field.key,
        label: field.label,
        aliases: field.aliases,
        dataType: field.dataType,
        required: field.isRequired,
      })),
      context: dossierContext(job.document),
    };
  }
  return null;
}

async function getActiveWorkerJob(jobId: number, workerId: string) {
  const job = await prisma.documentIndexingJob.findUnique({ where: { id: jobId }, include: { document: true } });
  if (!job || job.status !== "EN_COURS" || job.workerId !== workerId) {
    throw new ApiError("Travail d'indexation introuvable ou non attribué à ce worker.", 409);
  }
  return job;
}

export async function readIndexingJobDocument(jobId: number, workerId: string) {
  const job = await getActiveWorkerJob(jobId, workerId);
  const storage = getStorageProvider(job.document.storageProvider);
  return { document: job.document, buffer: await storage.read(storageReference(job.document)) };
}

export async function storeIndexingPdfa(jobId: number, workerId: string, buffer: Buffer) {
  const job = await getActiveWorkerJob(jobId, workerId);
  if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024 || !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new ApiError("Le dérivé OCR doit être un PDF valide de 50 Mo maximum.");
  }
  const storage = getStorageProvider(job.document.storageProvider);
  const storageKey = `${job.document.dossierId}/derived/${job.documentId}-ocr-pdfa.pdf`;
  const stored = await storage.save(storageKey, buffer, { contentType: "application/pdf" });
  const hash = createHash("sha256").update(buffer).digest("hex");
  return prisma.documentDerivative.upsert({
    where: { documentId_kind: { documentId: job.documentId, kind: "PDFA_OCR" } },
    create: {
      documentId: job.documentId,
      kind: "PDFA_OCR",
      storageProvider: storage.kind,
      storageKey,
      url: stored.url,
      mimeType: "application/pdf",
      size: buffer.length,
      hash,
      externalDriveId: stored.externalDriveId,
      externalItemId: stored.externalItemId,
      externalWebUrl: stored.externalWebUrl,
    },
    update: {
      storageProvider: storage.kind,
      storageKey,
      url: stored.url,
      mimeType: "application/pdf",
      size: buffer.length,
      hash,
      externalDriveId: stored.externalDriveId,
      externalItemId: stored.externalItemId,
      externalWebUrl: stored.externalWebUrl,
    },
  });
}

function mergeWorkerFields(textValues: ExtractedIndexValue[], result: WorkerResult, fields: IndexingFieldDefinition[]) {
  const byField = new Map(textValues.map((value) => [value.fieldId, value]));
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  for (const extracted of result.fields) {
    const field = fieldsByKey.get(extracted.key);
    if (!field) continue;
    const normalized = normalizeIndexValue(extracted.value, field.dataType);
    const value = harmonizeIndexValue(field.key, normalized);
    if (!value) continue;
    const candidate: ExtractedIndexValue = {
      fieldId: field.id,
      key: field.key,
      value,
      rawValue: extracted.rawValue ?? extracted.value,
      confidence: extracted.confidence,
      source: "OCR",
    };
    const current = byField.get(field.id);
    if (!current || candidate.confidence > current.confidence) byField.set(field.id, candidate);
  }
  return [...byField.values()].map((value) => ({ ...value, value: harmonizeIndexValue(value.key, value.value) }));
}

function aggregateConfidence(workerConfidence: number, values: ExtractedIndexValue[], fieldCount: number) {
  const ocrValues = values.filter((value) => value.source === "OCR");
  const fieldConfidence = ocrValues.length > 0
    ? ocrValues.reduce((sum, value) => sum + value.confidence, 0) / ocrValues.length
    : workerConfidence;
  const coverage = fieldCount > 0 ? Math.min(100, (values.length / fieldCount) * 100) : 100;
  return Math.round((workerConfidence * 0.65 + fieldConfidence * 0.25 + coverage * 0.1) * 100) / 100;
}

export async function completeIndexingJob(jobId: number, result: WorkerResult) {
  const job = await getActiveWorkerJob(jobId, result.workerId);
  const document = await prisma.document.findUnique({
    where: { id: job.documentId },
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
      indexValues: { select: { fieldId: true, source: true, validated: true } },
    },
  });
  if (!document) throw new ApiError("Document introuvable.", 404);
  const [fields, typesPiece] = await Promise.all([
    prisma.indexingField.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.typePiece.findMany({ where: { isActive: true }, select: { id: true, libelle: true } }),
  ]);
  const context = dossierContext(document);
  const textValues = extractConfiguredValues(result.extractedText, fields).map((value) => ({
    ...value,
    value: harmonizeIndexValue(value.key, value.value),
  }));
  const workerValues = mergeWorkerFields(textValues, result, fields);
  const extracted = mergeDossierValues(workerValues, fields, context).map((value) => ({
    ...value,
    value: harmonizeIndexValue(value.key, value.value),
  }));
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

  const confidence = aggregateConfidence(result.confidence, extracted, fields.length);
  const issues = validateIndexingRules(extracted, fields);
  const decision = decideAutomaticIndexing({ confidence, analysisPass: job.analysisPass, issues });
  const classificationPath = buildClassificationPath(context);
  const typePiece = findTypePiece(result.extractedText, document.nomOriginal, typesPiece);
  const byKey = new Map(extracted.map((value) => [value.key, value]));
  const title = byKey.get("document_title")?.value || path.parse(document.nomOriginal).name;
  const reference = byKey.get("business_reference")?.value || document.dossier.reference;
  const dateValue = byKey.get("document_date")?.value;
  const parsedDate = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? new Date(`${dateValue}T00:00:00.000Z`) : null;
  const protectedFields = new Set(
    document.indexValues.filter((value) => value.source === "MANUAL" && value.validated).map((value) => value.fieldId),
  );

  await prisma.$transaction(async (tx) => {
    for (const value of extracted) {
      if (protectedFields.has(value.fieldId)) continue;
      await tx.documentIndexValue.upsert({
        where: { documentId_fieldId: { documentId: document.id, fieldId: value.fieldId } },
        create: {
          documentId: document.id,
          fieldId: value.fieldId,
          value: value.value,
          rawValue: value.rawValue,
          confidence: new Prisma.Decimal(value.confidence),
          source: value.source,
          validated: decision === "INDEXE" || value.source === "DOSSIER",
        },
        update: {
          value: value.value,
          rawValue: value.rawValue,
          confidence: new Prisma.Decimal(value.confidence),
          source: value.source,
          validated: decision === "INDEXE" || value.source === "DOSSIER",
        },
      });
    }
    const searchText = buildDocumentSearchText({
      extractedText: result.extractedText,
      originalName: document.nomOriginal,
      title: decision === "INDEXE" ? title : document.titreIndexation,
      reference: decision === "INDEXE" ? reference : document.referenceIndexation,
      typePiece: decision === "INDEXE" ? typePiece?.libelle : undefined,
      classificationPath,
      values: extracted.map((value) => ({
        value: value.value,
        searchable: fields.find((field) => field.id === value.fieldId)?.isSearchable ?? true,
      })),
    });
    const note = issues.length > 0
      ? issues.join("; ")
      : decision === "A_REQUALIFIER"
        ? `Confiance ${confidence} %, données officielles non modifiées.`
        : `Validation automatique, confiance ${confidence} %.`;

    await tx.document.update({
      where: { id: document.id },
      data: {
        automaticIndexStatus: decision,
        extractedText: result.extractedText,
        searchText,
        indexingConfidence: new Prisma.Decimal(confidence),
        classificationPath,
        indexedAt: decision === "DEUXIEME_LECTURE" ? document.indexedAt : new Date(),
        lastIndexingError: decision === "A_REQUALIFIER" ? note : null,
        preIndexStatus: decision === "DEUXIEME_LECTURE" ? "BROUILLON" : "PRET",
        preIndexNotes: note,
        preIndexedBy: decision === "INDEXE" ? null : document.preIndexedBy,
        preIndexedAt: decision === "INDEXE" ? new Date() : document.preIndexedAt,
        titreIndexation: decision === "INDEXE" ? (document.titreIndexation || title) : document.titreIndexation,
        referenceIndexation: decision === "INDEXE" ? (document.referenceIndexation || reference) : document.referenceIndexation,
        dateDocument: decision === "INDEXE" ? (document.dateDocument ?? parsedDate) : document.dateDocument,
        nombrePages: document.nombrePages ?? result.pageCount ?? null,
        typePieceId: decision === "INDEXE" ? (document.typePieceId ?? typePiece?.id ?? null) : document.typePieceId,
      },
    });
    await tx.documentIndexingJob.update({
      where: { id: job.id },
      data: { status: "TERMINE", completedAt: new Date(), error: decision === "A_REQUALIFIER" ? note : null },
    });
    if (decision === "DEUXIEME_LECTURE") {
      await tx.documentIndexingJob.create({
        data: { documentId: document.id, requestedBy: job.requestedBy, analysisPass: "SECONDE_LECTURE" },
      });
    }
    await tx.documentIndexingRun.create({
      data: {
        documentId: document.id,
        triggeredBy: job.requestedBy,
        status: decision,
        engine: result.engine,
        extractedFields: extracted.map(({ fieldId, key, value, confidence: fieldConfidence, source }) => ({
          fieldId, key, value, confidence: fieldConfidence, source,
        })),
        extractedTextSize: result.extractedText.length,
        confidence: new Prisma.Decimal(confidence),
        error: decision === "A_REQUALIFIER" ? note : null,
        completedAt: new Date(),
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: document.dossierId,
        userId: job.requestedBy,
        action: decision === "INDEXE" ? "INDEXATION_AUTOMATIQUE_VALIDEE" : decision,
        commentaire: `${document.nomOriginal} : ${extracted.length} champ(s), confiance ${confidence} %`,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: job.requestedBy,
        action: "DOCUMENT_AUTO_INDEX_COMPLETE",
        entity: "DOCUMENT",
        entityId: document.id,
        newValue: { jobId: job.id, engine: result.engine, decision, confidence, issues, classificationPath },
      },
    });
  });
  await reconcileDossierIndexation(document.dossierId, job.requestedBy);
  return { documentId: document.id, status: decision, fields: extracted.length, confidence, issues };
}

export async function failIndexingJob(jobId: number, failure: WorkerFailure) {
  const job = await getActiveWorkerJob(jobId, failure.workerId);
  const document = await prisma.document.findUnique({
    where: { id: job.documentId },
    select: { dossierId: true },
  });
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(15 * 60, 30 * (2 ** Math.max(0, job.attempts - 1)));
  await prisma.$transaction([
    prisma.documentIndexingJob.update({
      where: { id: job.id },
      data: terminal
        ? { status: "ERREUR", error: failure.error, completedAt: new Date() }
        : {
            status: "EN_ATTENTE",
            error: failure.error,
            workerId: null,
            lockedAt: null,
            availableAt: new Date(Date.now() + delaySeconds * 1000),
          },
    }),
    prisma.document.update({
      where: { id: job.documentId },
      data: {
        automaticIndexStatus: terminal ? "ERREUR" : job.analysisPass === "PRINCIPALE" ? "EN_FILE" : "DEUXIEME_LECTURE",
        lastIndexingError: failure.error,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: job.requestedBy,
        action: terminal ? "DOCUMENT_AUTO_INDEX_ERROR" : "DOCUMENT_AUTO_INDEX_RETRY",
        entity: "DOCUMENT",
        entityId: job.documentId,
        newValue: { jobId: job.id, attempts: job.attempts, error: failure.error },
      },
    }),
  ]);
  if (terminal && document) {
    await reconcileDossierIndexation(document.dossierId, job.requestedBy);
  }
  return { retrying: !terminal, attempts: job.attempts, maxAttempts: job.maxAttempts };
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
