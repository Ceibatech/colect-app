"use server";

import { randomUUID } from "node:crypto";
import { Prisma, type TransferItemStatus, type TransferLotStatus, type TransferMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { notifyTransferWorkflow } from "@/lib/services/transfer-notification-service";
import { authorizeTransferLotSchema, createTransferLotSchema, recordTransferMovementSchema, transferApprovalSchema } from "@/lib/validation/transfer";
import {
  deriveTransferLotStatus,
  getTransferMovementRule,
  isTransferMovementChronologyValid,
  type TransferItemStatusCode,
  type TransferLotStatusCode,
} from "@/lib/utils/transfer-stock";
import { getClientIp } from "@/lib/utils/server-request";

export interface TransferActionState {
  success?: boolean;
  error?: string;
  message?: string;
  lotId?: number;
}

class TransferRuleError extends Error {}

function parseIdList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

type TransferNotificationInput = Parameters<typeof notifyTransferWorkflow>[0];

function formatTransferDate(value: Date | null): string {
  if (!value) return "À planifier";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(value);
}

function cleanReferencePart(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

async function notifyAfterTransferCommit(input: TransferNotificationInput): Promise<void> {
  try {
    const result = await notifyTransferWorkflow(input);
    if (result.failed > 0) {
      console.error("One or more transfer notifications failed.", { event: input.event, entityId: input.entityId, ...result });
    }
  } catch (error) {
    // Le jalon métier est déjà validé. Une panne de messagerie ne doit jamais
    // annuler ni masquer l'opération de transfert enregistrée en base.
    console.error("Transfer workflow notification failed after commit.", { event: input.event, entityId: input.entityId, error });
  }
}

async function runAfterTransferCommit(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error("Transfer post-commit task failed.", error);
  }
}

async function getTransferLotNotificationSummary(id: number) {
  const lot = await prisma.transferLot.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      plannedAt: true,
      createdById: true,
      sourceSite: { select: { nom: true } },
      destinationSite: { select: { nom: true } },
      items: { select: { dossierCountSnapshot: true } },
    },
  });
  if (!lot) return null;
  return {
    ...lot,
    cartonCount: lot.items.length,
    dossierCount: lot.items.reduce((total, item) => total + item.dossierCountSnapshot, 0),
  };
}

async function getTransferMovementNotificationSummary(id: number) {
  const movement = await prisma.transferMovement.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      type: true,
      incidentReported: true,
      transferLot: {
        select: {
          id: true,
          reference: true,
          createdById: true,
          sourceSite: { select: { nom: true } },
          destinationSite: { select: { nom: true } },
        },
      },
      items: { select: { transferLotItem: { select: { dossierCountSnapshot: true } } } },
    },
  });
  if (!movement) return null;
  return {
    ...movement,
    cartonCount: movement.items.length,
    dossierCount: movement.items.reduce((total, item) => total + item.transferLotItem.dossierCountSnapshot, 0),
  };
}

async function getReadyTransferOperationSummary(lotId: number) {
  const selected = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      plannedAt: true,
      sourceSiteId: true,
      sourceEntrepotId: true,
      destinationSiteId: true,
      destinationEntrepotId: true,
      sourceSite: { select: { code: true, nom: true } },
      destinationSite: { select: { code: true, nom: true } },
    },
  });
  if (!selected?.plannedAt) return null;

  const start = new Date(Date.UTC(selected.plannedAt.getUTCFullYear(), selected.plannedAt.getUTCMonth(), selected.plannedAt.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const lots = await prisma.transferLot.findMany({
    where: {
      plannedAt: { gte: start, lt: end },
      sourceSiteId: selected.sourceSiteId,
      sourceEntrepotId: selected.sourceEntrepotId,
      destinationSiteId: selected.destinationSiteId,
      destinationEntrepotId: selected.destinationEntrepotId,
      status: { not: "ANNULE" },
    },
    select: { authorizedAt: true, createdById: true, items: { select: { dossierCountSnapshot: true } } },
  });
  if (lots.length === 0 || lots.some((lot) => !lot.authorizedAt)) return null;

  const date = start.toISOString().slice(0, 10);
  return {
    reference: `TRF-${date.replaceAll("-", "")}-${cleanReferencePart(selected.sourceSite.code)}-${cleanReferencePart(selected.destinationSite.code)}`,
    plannedAt: start,
    sourceName: selected.sourceSite.nom,
    destinationName: selected.destinationSite.nom,
    lotCount: lots.length,
    cartonCount: lots.reduce((total, lot) => total + lot.items.length, 0),
    dossierCount: lots.reduce((total, lot) => total + lot.items.reduce((subtotal, item) => subtotal + item.dossierCountSnapshot, 0), 0),
    createdByIds: [...new Set(lots.map((lot) => lot.createdById))],
  };
}

function lotNotificationDetails(lot: NonNullable<Awaited<ReturnType<typeof getTransferLotNotificationSummary>>>) {
  return [
    { label: "Date prévue", value: formatTransferDate(lot.plannedAt) },
    { label: "Trajet", value: `${lot.sourceSite.nom} → ${lot.destinationSite.nom}` },
    { label: "Cartons", value: String(lot.cartonCount) },
    { label: "Dossiers", value: String(lot.dossierCount) },
  ];
}

function movementNotificationDetails(movement: NonNullable<Awaited<ReturnType<typeof getTransferMovementNotificationSummary>>>) {
  return [
    { label: "Opération", value: movement.transferLot.reference },
    { label: "Mouvement", value: movement.type === "SORTIE" ? "Sortie" : movement.type === "RECEPTION" ? "Réception" : "Retour" },
    { label: "Trajet", value: `${movement.transferLot.sourceSite.nom} → ${movement.transferLot.destinationSite.nom}` },
    { label: "Cartons", value: String(movement.cartonCount) },
    { label: "Dossiers", value: String(movement.dossierCount) },
  ];
}

export async function createTransferLot(
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CREATE");
  const parsed = createTransferLotSchema.safeParse({
    sourceSiteId: formData.get("sourceSiteId"),
    sourceEntrepotId: formData.get("sourceEntrepotId"),
    destinationSiteId: formData.get("destinationSiteId"),
    destinationEntrepotId: formData.get("destinationEntrepotId"),
    includeUnlocated: formData.get("includeUnlocated"),
    plannedAt: formData.get("plannedAt"),
    archiveSupport: formData.get("archiveSupport"),
    plannedRoute: formData.get("plannedRoute"),
    transportMethod: formData.get("transportMethod"),
    ceibaParticipants: formData.get("ceibaParticipants"),
    sdaParticipants: formData.get("sdaParticipants"),
    riskAssessment: formData.get("riskAssessment"),
    securityMeasures: formData.get("securityMeasures"),
    motif: formData.get("motif"),
    dossierIds: parseIdList(formData.get("dossierIds")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Lot de transfert invalide." };

  if (
    parsed.data.sourceSiteId === parsed.data.destinationSiteId
    && (parsed.data.sourceEntrepotId ?? null) === (parsed.data.destinationEntrepotId ?? null)
  ) {
    return { error: "Le point de départ et le point de destination doivent être différents." };
  }

  const dossierIds = [...new Set(parsed.data.dossierIds)];
  if (dossierIds.length !== parsed.data.dossierIds.length) return { error: "Un dossier a été sélectionné plusieurs fois." };

  const [sourceSite, destinationSite, sourceEntrepot, destinationEntrepot] = await Promise.all([
    prisma.site.findFirst({ where: { id: parsed.data.sourceSiteId, isActive: true, organisation: "MINISTERE" }, select: { id: true } }),
    prisma.site.findFirst({ where: { id: parsed.data.destinationSiteId, isActive: true, organisation: "CEIBA" }, select: { id: true } }),
    parsed.data.sourceEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.sourceEntrepotId, siteId: parsed.data.sourceSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    parsed.data.destinationEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.destinationEntrepotId, siteId: parsed.data.destinationSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!sourceSite) return { error: "Le point de départ doit être un site d'inventaire actif du ministère." };
  if (!destinationSite) return { error: "La destination doit être un site de traitement CEIBA actif." };
  if (parsed.data.sourceEntrepotId && !sourceEntrepot) return { error: "L'entrepôt de départ est invalide." };
  if (parsed.data.destinationEntrepotId && !destinationEntrepot) return { error: "L'entrepôt de destination est invalide." };

  try {
    const ip = await getClientIp();
    const plannedAt = new Date(parsed.data.plannedAt);
    const result = await prisma.$transaction(async (tx) => {
      const operationStart = new Date(Date.UTC(plannedAt.getUTCFullYear(), plannedAt.getUTCMonth(), plannedAt.getUTCDate()));
      const operationEnd = new Date(operationStart);
      operationEnd.setUTCDate(operationEnd.getUTCDate() + 1);
      const signedOperation = await tx.transferLot.findFirst({
        where: {
          plannedAt: { gte: operationStart, lt: operationEnd },
          sourceSiteId: parsed.data.sourceSiteId,
          sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
          destinationSiteId: parsed.data.destinationSiteId,
          destinationEntrepotId: parsed.data.destinationEntrepotId ?? null,
          authorizedAt: { not: null },
          status: { not: "ANNULE" },
        },
        select: { reference: true },
      });
      if (signedOperation) {
        throw new TransferRuleError(`L'opération de cette date est déjà en cours de signature (${signedOperation.reference}). Planifiez une nouvelle date pour ajouter d'autres cartons.`);
      }

      const dossiers = await tx.dossier.findMany({
        where: {
          id: { in: dossierIds },
          OR: [
            { siteId: parsed.data.sourceSiteId, entrepotId: parsed.data.sourceEntrepotId ?? null },
            ...(parsed.data.includeUnlocated ? [{ siteId: null }] : []),
          ],
        },
        select: { id: true, reference: true, siteId: true, codeBarres: true, libelleCarton: true },
      });
      if (dossiers.length !== dossierIds.length) {
        throw new TransferRuleError("Un dossier sélectionné n'est plus disponible au point de départ. Actualisez la liste.");
      }

      const conflict = await tx.transferLotDossier.findFirst({
        where: {
          dossierId: { in: dossierIds },
          transferLotItem: {
            status: { in: ["PREVU", "SORTI"] },
            transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
          },
        },
        select: {
          dossier: { select: { reference: true } },
          transferLotItem: { select: { transferLot: { select: { reference: true } } } },
        },
      });
      if (conflict) {
        throw new TransferRuleError(`Le dossier ${conflict.dossier.reference} appartient déjà au lot ouvert ${conflict.transferLotItem.transferLot.reference}.`);
      }

      const grouped = new Map<string, { code: string; label: string | null; dossiers: typeof dossiers }>();
      for (const dossier of dossiers) {
        const key = dossier.codeBarres ? `CARTON:${dossier.codeBarres}` : `DOSSIER:${dossier.id}`;
        const group = grouped.get(key) ?? {
          code: dossier.codeBarres ?? `DOSSIER-${dossier.id}`,
          label: dossier.libelleCarton ?? (dossier.codeBarres ? null : `Dossier ${dossier.reference}`),
          dossiers: [],
        };
        group.dossiers.push(dossier);
        grouped.set(key, group);
      }
      const groups = [...grouped.values()];
      const unlocatedIds = dossiers.filter((dossier) => dossier.siteId === null).map((dossier) => dossier.id);

      const temporaryReference = `TMP-${randomUUID()}`;
      const lot = await tx.transferLot.create({
        data: {
          reference: temporaryReference,
          sourceSiteId: parsed.data.sourceSiteId,
          sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
          destinationSiteId: parsed.data.destinationSiteId,
          destinationEntrepotId: parsed.data.destinationEntrepotId ?? null,
          plannedAt,
          archiveSupport: parsed.data.archiveSupport,
          plannedRoute: parsed.data.plannedRoute,
          transportMethod: parsed.data.transportMethod,
          ceibaParticipants: parsed.data.ceibaParticipants,
          sdaParticipants: parsed.data.sdaParticipants,
          riskAssessment: parsed.data.riskAssessment,
          securityMeasures: parsed.data.securityMeasures,
          motif: parsed.data.motif || null,
          createdById: session.userId,
        },
      });
      const year = new Date().getUTCFullYear();
      const reference = `LOT-${year}-${String(lot.id).padStart(6, "0")}`;
      await tx.transferLot.update({ where: { id: lot.id }, data: { reference } });

      if (unlocatedIds.length > 0) {
        const attached = await tx.dossier.updateMany({
          where: { id: { in: unlocatedIds }, siteId: null },
          data: { siteId: parsed.data.sourceSiteId, entrepotId: parsed.data.sourceEntrepotId ?? null },
        });
        if (attached.count !== unlocatedIds.length) {
          throw new TransferRuleError("L'emplacement d'un dossier historique vient d'être modifié. Actualisez la liste puis réessayez.");
        }
      }

      await tx.transferLotItem.createMany({
        data: groups.map((group) => ({
          transferLotId: lot.id,
          cartonCode: group.code,
          cartonLabel: group.label,
          dossierCountSnapshot: group.dossiers.length,
        })),
      });
      const createdItems = await tx.transferLotItem.findMany({
        where: { transferLotId: lot.id },
        select: { id: true, cartonCode: true },
      });
      const itemByCode = new Map(createdItems.map((item) => [item.cartonCode, item.id]));
      await tx.transferLotDossier.createMany({
        data: groups.flatMap((group) => group.dossiers.map((dossier) => ({
          transferLotItemId: itemByCode.get(group.code)!,
          dossierId: dossier.id,
        }))),
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_CREATE",
          entity: "TRANSFER_LOT",
          entityId: lot.id,
          newValue: { reference, dossierCount: dossierIds.length, attachedToSourceCount: unlocatedIds.length, groupCount: groups.length, sourceSiteId: parsed.data.sourceSiteId, destinationSiteId: parsed.data.destinationSiteId },
          ipAddress: ip,
        },
      });
      return { id: lot.id, reference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    return { success: true, lotId: result.id, message: `Le lot ${result.reference} a été créé.` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre transfert vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Transfer lot creation failed.", error);
    return { error: "Le lot de transfert n'a pas pu être créé." };
  }
}

export async function submitTransferLot(id: number): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_SUBMIT");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "BROUILLON", items: { some: {} } },
        data: { status: "SOUMIS", submittedAt: new Date() },
      });
      if (updated.count !== 1) throw new TransferRuleError("Ce lot n'est plus disponible pour soumission.");
      await tx.auditLog.create({
        data: { userId: session.userId, action: "TRANSFER_LOT_SUBMIT", entity: "TRANSFER_LOT", entityId: id, ipAddress: ip },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const lot = await getTransferLotNotificationSummary(id);
      if (!lot) return;
      await notifyAfterTransferCommit({
        event: "LOT_SUBMITTED",
        entityType: "TRANSFER_LOT",
        entityId: id,
        recipientRoleCodes: ["VALIDATEUR_CEIBAC"],
        title: `Lot ${lot.reference} à valider`,
        message: "Le gestionnaire des transferts a soumis ce lot. Votre visa CEIBA est requis avant sa transmission au ministère.",
        reference: lot.reference,
        statusLabel: "En attente du visa CEIBA",
        actionPath: `/transferts/${id}`,
        actionLabel: "Examiner le lot",
        details: lotNotificationDetails(lot),
      });
    });
    return { success: true, message: "Le lot a été transmis au responsable CEIBA pour validation." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("Transfer lot submission failed.", error);
    return { error: "La soumission du lot a échoué." };
  }
}

export async function approveTransferLotByCeibac(
  id: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CEIBAC_APPROVE");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };
  const parsed = transferApprovalSchema.safeParse({
    signatoryName: formData.get("signatoryName"),
    signatoryTitle: formData.get("signatoryTitle"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "SOUMIS", items: { some: {} } },
        data: {
          status: "VALIDE_CEIBAC",
          ceibacValidatedAt: new Date(),
          ceibacValidatedById: session.userId,
          ceibacSignatoryName: parsed.data.signatoryName,
          ceibacSignatoryTitle: parsed.data.signatoryTitle,
          ceibacSignatureData: parsed.data.signature,
        },
      });
      if (updated.count !== 1) throw new TransferRuleError("Ce lot n'attend plus la validation CEIBA.");
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_CEIBAC_APPROVE",
          entity: "TRANSFER_LOT",
          entityId: id,
          newValue: { signatoryName: parsed.data.signatoryName, signatoryTitle: parsed.data.signatoryTitle },
          ipAddress: ip,
        },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const lot = await getTransferLotNotificationSummary(id);
      if (!lot) return;
      await notifyAfterTransferCommit({
        event: "LOT_CEIBA_VALIDATED",
        entityType: "TRANSFER_LOT",
        entityId: id,
        recipientRoleCodes: ["VALIDATEUR_MINISTERE"],
        title: `Autorisation requise pour ${lot.reference}`,
        message: "Le lot a reçu le visa CEIBA. Le responsable habilité du ministère doit maintenant autoriser sa sortie.",
        reference: lot.reference,
        statusLabel: "En attente de l'autorisation du ministère",
        actionPath: `/transferts/${id}`,
        actionLabel: "Autoriser le transfert",
        details: lotNotificationDetails(lot),
      });
    });
    return { success: true, message: "Le lot est validé par CEIBA et transmis au ministère pour autorisation." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("CEIBA lot approval failed.", error);
    return { error: "La validation CEIBA du lot a échoué." };
  }
}

export async function authorizeTransferLot(
  id: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_AUTHORIZE");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };
  const parsed = authorizeTransferLotSchema.safeParse({
    signatoryName: formData.get("signatoryName"),
    signatoryTitle: formData.get("signatoryTitle"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "VALIDE_CEIBAC", ceibacValidatedAt: { not: null }, items: { some: {} } },
        data: {
          status: "AUTORISE",
          authorizedAt: new Date(),
          authorizedById: session.userId,
          approvalSignatoryName: parsed.data.signatoryName,
          approvalSignatoryTitle: parsed.data.signatoryTitle,
          approvalSignatureData: parsed.data.signature,
        },
      });
      if (updated.count !== 1) throw new TransferRuleError("Ce lot doit être validé par CEIBA avant l'autorisation du ministère, ou a déjà été autorisé.");
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_AUTHORIZE",
          entity: "TRANSFER_LOT",
          entityId: id,
          newValue: { signatoryName: parsed.data.signatoryName, signatoryTitle: parsed.data.signatoryTitle },
          ipAddress: ip,
        },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const operation = await getReadyTransferOperationSummary(id);
      if (!operation) return;
      await notifyAfterTransferCommit({
        event: "AUTHORIZATION_F01_READY",
        entityType: "TRANSFER_OPERATION",
        entityId: id,
        recipientRoleCodes: ["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC"],
        recipientUserIds: operation.createdByIds,
        title: `Autorisation ${operation.reference} disponible`,
        message: "Tous les lots prévus pour cette date et ce trajet sont autorisés. La F01 consolidée est signée et prête pour la préparation du transfert.",
        reference: operation.reference,
        statusLabel: "Document F01 signé disponible",
        actionPath: `/transferts/${id}`,
        actionLabel: "Consulter l'opération",
        documentPath: `/api/transferts/${id}/autorisation`,
        documentLabel: "Télécharger l'autorisation F01",
        details: [
          { label: "Date prévue", value: formatTransferDate(operation.plannedAt) },
          { label: "Trajet", value: `${operation.sourceName} → ${operation.destinationName}` },
          { label: "Lots", value: String(operation.lotCount) },
          { label: "Cartons", value: String(operation.cartonCount) },
          { label: "Dossiers", value: String(operation.dossierCount) },
        ],
      });
    });
    return { success: true, message: "Le lot est autorisé. La F01 consolidée sera disponible lorsque tous les lots de cette date et de ce trajet seront autorisés." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("Transfer lot authorization failed.", error);
    return { error: "L'autorisation du lot a échoué." };
  }
}

export async function recordTransferMovement(
  lotId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_OPERATE");
  const parsed = recordTransferMovementSchema.safeParse({
    type: formData.get("type"),
    itemIds: formData.getAll("itemIds"),
    occurredAt: formData.get("occurredAt"),
    observations: formData.get("observations"),
    conditionStatus: formData.get("conditionStatus") || undefined,
    vehicleRegistration: formData.get("vehicleRegistration"),
    vehicleDescription: formData.get("vehicleDescription"),
    driverName: formData.get("driverName"),
    driverPhone: formData.get("driverPhone"),
    ceibaEscortName: formData.get("ceibaEscortName"),
    sealReferences: formData.get("sealReferences"),
    sealStatus: formData.get("sealStatus") || undefined,
    incidentReported: formData.get("incidentReported"),
    incidentDescription: formData.get("incidentDescription"),
    ministryName: formData.get("ministryName"),
    ministryTitle: formData.get("ministryTitle"),
    ministrySignature: formData.get("ministrySignature"),
    ceibacName: formData.get("ceibacName"),
    ceibacTitle: formData.get("ceibacTitle"),
    ceibacSignature: formData.get("ceibacSignature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mouvement invalide." };
  if (!Number.isInteger(lotId) || lotId <= 0) return { error: "Lot invalide." };

  const itemIds = [...new Set(parsed.data.itemIds)];
  if (itemIds.length !== parsed.data.itemIds.length) return { error: "Un groupe de dossiers a été sélectionné plusieurs fois." };
  const occurredAt = new Date(parsed.data.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return { error: "La date du mouvement ne peut pas être dans le futur." };

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.transferLot.findUnique({
        where: { id: lotId },
        include: {
          items: {
            select: {
              id: true,
              status: true,
              departedAt: true,
              receivedAt: true,
              dossiers: { select: { dossierId: true } },
            },
          },
        },
      });
      if (!lot) throw new TransferRuleError("Lot introuvable.");
      if (["BROUILLON", "SOUMIS", "VALIDE_CEIBAC", "ANNULE", "CLOTURE"].includes(lot.status)) {
        throw new TransferRuleError(["BROUILLON", "SOUMIS", "VALIDE_CEIBAC"].includes(lot.status) ? "Le lot doit être autorisé par le ministère avant toute sortie." : "Ce lot ne peut plus recevoir de mouvement.");
      }

      const type = parsed.data.type as TransferMovementType;
      const rule = getTransferMovementRule(parsed.data.type);
      const selected = lot.items.filter((item) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length || selected.some((item) => item.status !== rule.before)) {
        throw new TransferRuleError("La sélection contient des dossiers qui ne sont plus disponibles pour ce mouvement.");
      }
      if (selected.some((item) => !isTransferMovementChronologyValid(parsed.data.type, occurredAt, item, lot.createdAt))) {
        throw new TransferRuleError("La date du mouvement doit être postérieure au jalon précédent de chaque groupe de dossiers.");
      }
      const pendingMovement = await tx.transferMovementItem.findFirst({
        where: {
          transferLotItemId: { in: itemIds },
          movement: { status: { in: ["SOUMIS_CEIBAC", "VALIDE_CEIBAC"] } },
        },
        select: { movement: { select: { reference: true } } },
      });
      if (pendingMovement) {
        throw new TransferRuleError(`Le bordereau ${pendingMovement.movement.reference} attend déjà une validation pour cette sélection.`);
      }

      const fromSiteId = type === "RETOUR" ? lot.destinationSiteId : lot.sourceSiteId;
      const toSiteId = type === "RETOUR" ? lot.sourceSiteId : lot.destinationSiteId;
      const dossierIds = [...new Set(selected.flatMap((item) => item.dossiers.map((link) => link.dossierId)))];
      const temporaryReference = `TMP-${randomUUID()}`;
      const movement = await tx.transferMovement.create({
        data: {
          transferLotId: lot.id,
          reference: temporaryReference,
          type,
          status: type === "RECEPTION" ? "SOUMIS_CEIBAC" : "VALIDE_CEIBAC",
          conditionStatus: type === "RECEPTION" ? parsed.data.conditionStatus : null,
          vehicleRegistration: parsed.data.vehicleRegistration ?? null,
          vehicleDescription: parsed.data.vehicleDescription ?? null,
          driverName: parsed.data.driverName ?? null,
          driverPhone: parsed.data.driverPhone ?? null,
          ceibaEscortName: parsed.data.ceibaEscortName ?? null,
          sealReferences: parsed.data.sealReferences ?? null,
          sealStatus: parsed.data.sealStatus ?? null,
          incidentReported: parsed.data.incidentReported,
          incidentDescription: parsed.data.incidentDescription ?? null,
          occurredAt,
          fromSiteId,
          toSiteId,
          observations: parsed.data.observations || null,
          createdById: session.userId,
          ceibacValidatedAt: type === "RECEPTION" ? null : occurredAt,
          ceibacValidatedById: type === "RECEPTION" ? null : session.userId,
          items: {
            create: selected.map((item) => ({
              transferLotItemId: item.id,
              statusBefore: rule.before as TransferItemStatus,
              statusAfter: rule.after as TransferItemStatus,
            })),
          },
          signatures: {
            create: [{
              party: "CEIBAC",
              signatoryName: parsed.data.ceibacName,
              signatoryTitle: parsed.data.ceibacTitle,
              signatureData: parsed.data.ceibacSignature,
              capturedById: session.userId,
              signedAt: occurredAt,
              ipAddress: ip,
            }],
          },
        },
      });
      const reference = `BTR-${new Date(occurredAt).getUTCFullYear()}-${String(movement.id).padStart(7, "0")}`;
      await tx.transferMovement.update({ where: { id: movement.id }, data: { reference } });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: type === "RECEPTION" ? "TRANSFER_RECEPTION_SUBMIT" : "TRANSFER_MOVEMENT_SUBMIT_MINISTRY",
          entity: "TRANSFER_MOVEMENT",
          entityId: movement.id,
          newValue: {
            reference,
            transferLotId: lot.id,
            type,
            itemCount: itemIds.length,
            dossierCount: dossierIds.length,
            conditionStatus: parsed.data.conditionStatus,
            vehicleRegistration: parsed.data.vehicleRegistration,
            driverName: parsed.data.driverName,
            ceibaEscortName: parsed.data.ceibaEscortName,
            sealStatus: parsed.data.sealStatus,
            incidentReported: parsed.data.incidentReported,
            nextValidator: type === "RECEPTION" ? "CEIBA_VALIDATOR" : "MINISTERE",
          },
          ipAddress: ip,
        },
      });
      return { movementId: movement.id, reference, nextValidator: type === "RECEPTION" ? "CEIBA" : "MINISTERE" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/transferts/${lotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    revalidatePath("/dossiers");
    revalidatePath("/dashboard/geographie");
    await runAfterTransferCommit(async () => {
      const movement = await getTransferMovementNotificationSummary(result.movementId);
      if (!movement) return;
      const incident = movement.incidentReported;
      const recipientRoleCodes = incident
        ? ["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "VALIDATEUR_MINISTERE"] as const
        : movement.type === "RECEPTION"
          ? ["VALIDATEUR_CEIBAC"] as const
          : ["VALIDATEUR_MINISTERE"] as const;
      const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
      await notifyAfterTransferCommit({
        event: incident
          ? "MOVEMENT_INCIDENT_REPORTED"
          : movement.type === "RECEPTION"
            ? "MOVEMENT_SUBMITTED_CEIBA"
            : "MOVEMENT_SUBMITTED_MINISTRY",
        entityType: "TRANSFER_MOVEMENT",
        entityId: movement.id,
        recipientRoleCodes: [...recipientRoleCodes],
        recipientUserIds: incident ? [movement.transferLot.createdById] : [],
        title: incident
          ? `Incident déclaré sur ${movement.reference}`
          : movement.type === "RECEPTION"
            ? `Constat ${movement.reference} à viser`
            : `Bordereau ${movement.reference} à contre-signer`,
        message: incident
          ? "Un incident a été déclaré pendant ce mouvement. Consultez immédiatement le dossier sécurisé pour examiner le constat et décider de la suite."
          : movement.type === "RECEPTION"
            ? "Le constat d'arrivée a été soumis. Le responsable CEIBA doit contrôler la réception avant transmission au ministère."
            : "Le bordereau de mouvement a été signé par CEIBA. La contre-signature du ministère est requise avant la mise à jour du stock.",
        reference: movement.reference,
        statusLabel: incident
          ? "Incident à traiter"
          : movement.type === "RECEPTION"
            ? "En attente du visa CEIBA"
            : "En attente du visa du ministère",
        actionPath: `/transferts/${movement.transferLot.id}`,
        actionLabel: incident ? "Examiner l'incident" : "Examiner le bordereau",
        documentPath: `/api/transferts/${movement.transferLot.id}/bordereaux/${movement.id}`,
        documentLabel: `Télécharger le bordereau ${documentCode}`,
        details: movementNotificationDetails(movement),
        alert: incident,
      });
    });
    return {
      success: true,
      message: result.nextValidator === "CEIBA"
        ? `Le constat ${result.reference} est soumis au validateur CEIBA. Le stock reste en transit.`
        : `Le bordereau F02 ${result.reference} est transmis au ministère. Le stock reste inchangé jusqu'à sa contre-signature.`,
    };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre agent vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Transfer movement creation failed.", error);
    return { error: "Le mouvement n'a pas pu être enregistré." };
  }
}

export async function approveReceptionByCeiba(
  movementId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CEIBAC_VALIDATE");
  if (!Number.isInteger(movementId) || movementId <= 0) return { error: "Constat invalide." };
  const parsed = transferApprovalSchema.safeParse({
    signatoryName: formData.get("signatoryName"),
    signatoryTitle: formData.get("signatoryTitle"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    const movement = await prisma.$transaction(async (tx) => {
      const current = await tx.transferMovement.findFirst({
        where: { id: movementId, type: "RECEPTION", status: "SOUMIS_CEIBAC" },
        select: { id: true, transferLotId: true, reference: true },
      });
      if (!current) throw new TransferRuleError("Ce constat n'attend plus le visa CEIBA.");
      await tx.transferSignature.create({
        data: {
          movementId,
          party: "CEIBAC_VALIDATOR",
          signatoryName: parsed.data.signatoryName,
          signatoryTitle: parsed.data.signatoryTitle,
          signatureData: parsed.data.signature,
          capturedById: session.userId,
          signedAt: new Date(),
          ipAddress: ip,
        },
      });
      await tx.transferMovement.update({
        where: { id: movementId },
        data: { status: "VALIDE_CEIBAC", ceibacValidatedAt: new Date(), ceibacValidatedById: session.userId },
      });
      await tx.auditLog.create({
        data: { userId: session.userId, action: "TRANSFER_RECEPTION_CEIBAC_VALIDATE", entity: "TRANSFER_MOVEMENT", entityId: movementId, ipAddress: ip },
      });
      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath(`/transferts/${movement.transferLotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const summary = await getTransferMovementNotificationSummary(movement.id);
      if (!summary) return;
      await notifyAfterTransferCommit({
        event: "MOVEMENT_CEIBA_VALIDATED",
        entityType: "TRANSFER_MOVEMENT",
        entityId: summary.id,
        recipientRoleCodes: ["VALIDATEUR_MINISTERE"],
        title: `Constat ${summary.reference} à contre-signer`,
        message: "Le constat de réception a reçu le visa CEIBA. Le ministère doit effectuer le contrôle final et contre-signer le document.",
        reference: summary.reference,
        statusLabel: "En attente du visa final du ministère",
        actionPath: `/transferts/${summary.transferLot.id}`,
        actionLabel: "Contrôler la réception",
        documentPath: `/api/transferts/${summary.transferLot.id}/bordereaux/${summary.id}`,
        documentLabel: "Télécharger le constat F03",
        details: movementNotificationDetails(summary),
      });
    });
    return { success: true, message: `Le constat ${movement.reference} est visé par CEIBA et transmis au ministère.` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("CEIBA reception approval failed.", error);
    return { error: "Le visa CEIBA n'a pas pu être enregistré." };
  }
}

export async function approveTransferMovementByMinistry(
  movementId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_AUTHORIZE");
  if (!Number.isInteger(movementId) || movementId <= 0) return { error: "Bordereau invalide." };
  const parsed = transferApprovalSchema.safeParse({
    signatoryName: formData.get("signatoryName"),
    signatoryTitle: formData.get("signatoryTitle"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.transferMovement.findFirst({
        where: { id: movementId, status: "VALIDE_CEIBAC" },
        include: {
          transferLot: true,
          items: { include: { transferLotItem: { include: { dossiers: { select: { dossierId: true } } } } } },
        },
      });
      if (!movement) throw new TransferRuleError("Ce bordereau n'attend plus le visa du ministère.");

      const flow = movement.type === "SORTIE"
        ? {
            before: "PREVU" as const,
            after: "SORTI" as const,
            expectedLocation: { siteId: movement.transferLot.sourceSiteId, entrepotId: movement.transferLot.sourceEntrepotId },
            nextLocation: { siteId: null, entrepotId: null },
            timestamp: { departedAt: movement.occurredAt },
            ancienStatut: `SITE_${movement.transferLot.sourceSiteId}`,
            nouveauStatut: "EN_TRANSIT",
          }
        : movement.type === "RECEPTION"
          ? {
              before: "SORTI" as const,
              after: "RECU" as const,
              expectedLocation: { siteId: null, entrepotId: null },
              nextLocation: { siteId: movement.transferLot.destinationSiteId, entrepotId: movement.transferLot.destinationEntrepotId },
              timestamp: { receivedAt: movement.occurredAt },
              ancienStatut: "EN_TRANSIT",
              nouveauStatut: `SITE_${movement.transferLot.destinationSiteId}`,
            }
          : {
              before: "RECU" as const,
              after: "RETOURNE" as const,
              expectedLocation: { siteId: movement.transferLot.destinationSiteId, entrepotId: movement.transferLot.destinationEntrepotId },
              nextLocation: { siteId: movement.transferLot.sourceSiteId, entrepotId: movement.transferLot.sourceEntrepotId },
              timestamp: { returnedAt: movement.occurredAt },
              ancienStatut: `SITE_${movement.transferLot.destinationSiteId}`,
              nouveauStatut: `SITE_${movement.transferLot.sourceSiteId}`,
            };

      if (movement.items.length === 0 || movement.items.some((entry) => entry.transferLotItem.status !== flow.before)) {
        throw new TransferRuleError("Le stock lié à ce bordereau a changé. Actualisez le lot avant de valider.");
      }

      const dossierIds = [...new Set(movement.items.flatMap((entry) => entry.transferLotItem.dossiers.map((link) => link.dossierId)))];
      const itemIds = movement.items.map((entry) => entry.transferLotItemId);
      const updatedDossiers = await tx.dossier.updateMany({
        where: { id: { in: dossierIds }, ...flow.expectedLocation },
        data: flow.nextLocation,
      });
      if (updatedDossiers.count !== dossierIds.length) {
        throw new TransferRuleError("L'emplacement d'un dossier a changé. Le bordereau ne peut pas être finalisé.");
      }
      const updatedItems = await tx.transferLotItem.updateMany({
        where: { id: { in: itemIds }, transferLotId: movement.transferLotId, status: flow.before },
        data: { status: flow.after, ...flow.timestamp },
      });
      if (updatedItems.count !== itemIds.length) throw new TransferRuleError("Le stock a changé pendant la validation.");

      await tx.transferSignature.create({
        data: {
          movementId,
          party: "MINISTERE",
          signatoryName: parsed.data.signatoryName,
          signatoryTitle: parsed.data.signatoryTitle,
          signatureData: parsed.data.signature,
          capturedById: session.userId,
          signedAt: new Date(),
          ipAddress: ip,
        },
      });
      await tx.dossierHistory.createMany({
        data: dossierIds.map((dossierId) => ({
          dossierId,
          userId: session.userId,
          action: `TRANSFER_${movement.type}`,
          ancienStatut: flow.ancienStatut,
          nouveauStatut: flow.nouveauStatut,
          commentaire: `Mouvement finalisé après les visas CEIBA et ministère par le bordereau ${movement.reference}.`,
          metadata: {
            transferLotId: movement.transferLotId,
            transferMovementId: movement.id,
            movementReference: movement.reference,
            movementType: movement.type,
            fromSiteId: movement.fromSiteId,
            toSiteId: movement.toSiteId,
          },
        })),
      });

      const finalItems = await tx.transferLotItem.findMany({ where: { transferLotId: movement.transferLotId }, select: { status: true } });
      const nextStatus = deriveTransferLotStatus(
        finalItems.map((item) => item.status as TransferItemStatusCode),
        movement.transferLot.status as TransferLotStatusCode,
      ) as TransferLotStatus;
      await tx.transferLot.update({ where: { id: movement.transferLotId }, data: { status: nextStatus } });
      await tx.transferMovement.update({
        where: { id: movementId },
        data: { status: "VALIDE_MINISTERE", ministryValidatedAt: new Date(), ministryValidatedById: session.userId },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: `TRANSFER_${movement.type}_MINISTRY_VALIDATE`,
          entity: "TRANSFER_MOVEMENT",
          entityId: movementId,
          newValue: { reference: movement.reference, dossierCount: dossierIds.length, status: nextStatus },
          ipAddress: ip,
        },
      });
      return { transferLotId: movement.transferLotId, reference: movement.reference, type: movement.type };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/transferts/${result.transferLotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    revalidatePath("/dossiers");
    revalidatePath("/dashboard/geographie");
    await runAfterTransferCommit(async () => {
      const movement = await getTransferMovementNotificationSummary(movementId);
      if (!movement) return;
      const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
      await notifyAfterTransferCommit({
        event: "MOVEMENT_SIGNED",
        entityType: "TRANSFER_MOVEMENT",
        entityId: movement.id,
        recipientRoleCodes: ["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC"],
        recipientUserIds: [movement.transferLot.createdById],
        title: `Bordereau ${movement.reference} signé`,
        message: "Le visa final du ministère est enregistré. Le bordereau signé est disponible et le stock documentaire a été mis à jour.",
        reference: movement.reference,
        statusLabel: `Document ${documentCode} signé disponible`,
        actionPath: `/transferts/${movement.transferLot.id}`,
        actionLabel: "Consulter le transfert",
        documentPath: `/api/transferts/${movement.transferLot.id}/bordereaux/${movement.id}`,
        documentLabel: `Télécharger le bordereau ${documentCode}`,
        details: movementNotificationDetails(movement),
      });
    });
    const stockMessage = result.type === "SORTIE"
      ? "Le stock du site A est décrémenté et le lot passe en transit."
      : result.type === "RECEPTION"
        ? "Le stock du site B est mis à jour."
        : "Le stock du site A est réintégré.";
    return { success: true, message: `Le bordereau ${result.reference} est contre-signé. ${stockMessage}` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre agent vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Ministry transfer approval failed.", error);
    return { error: "Le visa du ministère n'a pas pu être enregistré." };
  }
}
