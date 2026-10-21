"use server";

import { randomUUID } from "node:crypto";
import { Prisma, type TransferItemStatus, type TransferLotStatus, type TransferMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { createTransferLotSchema, recordTransferMovementSchema } from "@/lib/validation/transfer";
import { decodeTransferCartonKey } from "@/lib/utils/transfer-carton-key";
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

function parseDate(value: string | undefined) {
  return value ? new Date(value) : null;
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
    plannedAt: formData.get("plannedAt"),
    motif: formData.get("motif"),
    cartonKeys: formData.getAll("cartonKeys"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Lot de transfert invalide." };

  if (
    parsed.data.sourceSiteId === parsed.data.destinationSiteId
    && (parsed.data.sourceEntrepotId ?? null) === (parsed.data.destinationEntrepotId ?? null)
  ) {
    return { error: "Le point de départ et le point de destination doivent être différents." };
  }

  const decoded = parsed.data.cartonKeys.map(decodeTransferCartonKey);
  if (decoded.some((value) => value === null)) return { error: "Une référence de carton est invalide." };
  const cartonCodes = [...new Set(decoded.map((value) => value!.cartonCode))];
  if (cartonCodes.length !== parsed.data.cartonKeys.length) return { error: "Un carton a été sélectionné plusieurs fois." };
  if (decoded.some((value) => value!.siteId !== parsed.data.sourceSiteId || value!.entrepotId !== (parsed.data.sourceEntrepotId ?? null))) {
    return { error: "Tous les cartons doivent appartenir au point de départ sélectionné." };
  }

  const [sourceSite, destinationSite, sourceEntrepot, destinationEntrepot, dossiers] = await Promise.all([
    prisma.site.findFirst({ where: { id: parsed.data.sourceSiteId, isActive: true }, select: { id: true } }),
    prisma.site.findFirst({ where: { id: parsed.data.destinationSiteId, isActive: true }, select: { id: true } }),
    parsed.data.sourceEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.sourceEntrepotId, siteId: parsed.data.sourceSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    parsed.data.destinationEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.destinationEntrepotId, siteId: parsed.data.destinationSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    prisma.dossier.findMany({
      where: {
        siteId: parsed.data.sourceSiteId,
        entrepotId: parsed.data.sourceEntrepotId ?? null,
        codeBarres: { in: cartonCodes },
      },
      select: { id: true, reference: true, codeBarres: true, libelleCarton: true, statutPreparation: true },
    }),
  ]);
  if (!sourceSite || !destinationSite) return { error: "Le site de départ ou de destination n'est plus actif." };
  if (parsed.data.sourceEntrepotId && !sourceEntrepot) return { error: "L'entrepôt de départ est invalide." };
  if (parsed.data.destinationEntrepotId && !destinationEntrepot) return { error: "L'entrepôt de destination est invalide." };

  const grouped = new Map<string, typeof dossiers>();
  for (const dossier of dossiers) {
    if (!dossier.codeBarres) continue;
    const group = grouped.get(dossier.codeBarres) ?? [];
    group.push(dossier);
    grouped.set(dossier.codeBarres, group);
  }
  for (const code of cartonCodes) {
    const group = grouped.get(code);
    if (!group?.length) return { error: `Le carton ${code} n'existe plus au point de départ.` };
    if (group.some((dossier) => dossier.statutPreparation !== "TERMINE")) {
      return { error: `Le carton ${code} contient au moins un dossier dont la préparation n'est pas terminée.` };
    }
  }

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const conflict = await tx.transferLotItem.findFirst({
        where: {
          cartonCode: { in: cartonCodes },
          status: { not: "RETOURNE" },
          transferLot: {
            sourceSiteId: parsed.data.sourceSiteId,
            sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
            status: { notIn: ["CLOTURE", "ANNULE"] },
          },
        },
        select: { cartonCode: true, transferLot: { select: { reference: true } } },
      });
      if (conflict) throw new TransferRuleError(`Le carton ${conflict.cartonCode} appartient déjà au lot ouvert ${conflict.transferLot.reference}.`);

      const temporaryReference = `TMP-${randomUUID()}`;
      const lot = await tx.transferLot.create({
        data: {
          reference: temporaryReference,
          sourceSiteId: parsed.data.sourceSiteId,
          sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
          destinationSiteId: parsed.data.destinationSiteId,
          destinationEntrepotId: parsed.data.destinationEntrepotId ?? null,
          plannedAt: parseDate(parsed.data.plannedAt),
          motif: parsed.data.motif || null,
          createdById: session.userId,
        },
      });
      const year = new Date().getUTCFullYear();
      const reference = `LOT-${year}-${String(lot.id).padStart(6, "0")}`;
      await tx.transferLot.update({ where: { id: lot.id }, data: { reference } });

      for (const code of cartonCodes) {
        const group = grouped.get(code)!;
        await tx.transferLotItem.create({
          data: {
            transferLotId: lot.id,
            cartonCode: code,
            cartonLabel: group.find((dossier) => dossier.libelleCarton)?.libelleCarton ?? null,
            dossierCountSnapshot: group.length,
            dossiers: { create: group.map((dossier) => ({ dossierId: dossier.id })) },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_CREATE",
          entity: "TRANSFER_LOT",
          entityId: lot.id,
          newValue: { reference, cartonCount: cartonCodes.length, sourceSiteId: parsed.data.sourceSiteId, destinationSiteId: parsed.data.destinationSiteId },
          ipAddress: ip,
        },
      });
      return { id: lot.id, reference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath("/transferts");
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

export async function authorizeTransferLot(id: number): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_AUTHORIZE");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "BROUILLON", items: { some: {} } },
        data: { status: "AUTORISE", authorizedAt: new Date(), authorizedById: session.userId },
      });
      if (updated.count !== 1) throw new TransferRuleError("Ce lot n'est plus en attente d'autorisation.");
      await tx.auditLog.create({
        data: { userId: session.userId, action: "TRANSFER_LOT_AUTHORIZE", entity: "TRANSFER_LOT", entityId: id, ipAddress: ip },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    return { success: true, message: "Le lot est autorisé pour la sortie." };
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
  if (itemIds.length !== parsed.data.itemIds.length) return { error: "Un carton a été sélectionné plusieurs fois." };
  const occurredAt = new Date(parsed.data.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return { error: "La date du mouvement ne peut pas être dans le futur." };

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.transferLot.findUnique({
        where: { id: lotId },
        include: { items: { select: { id: true, status: true, departedAt: true, receivedAt: true } } },
      });
      if (!lot) throw new TransferRuleError("Lot introuvable.");
      if (["BROUILLON", "ANNULE", "CLOTURE"].includes(lot.status)) {
        throw new TransferRuleError(lot.status === "BROUILLON" ? "Le lot doit être autorisé avant toute sortie." : "Ce lot ne peut plus recevoir de mouvement.");
      }

      const type = parsed.data.type as TransferMovementType;
      const rule = getTransferMovementRule(parsed.data.type);
      const selected = lot.items.filter((item) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length || selected.some((item) => item.status !== rule.before)) {
        throw new TransferRuleError("La sélection contient un carton qui n'est plus disponible pour ce mouvement.");
      }
      if (selected.some((item) => !isTransferMovementChronologyValid(parsed.data.type, occurredAt, item, lot.createdAt))) {
        throw new TransferRuleError("La date du mouvement doit être postérieure au jalon précédent de chaque carton.");
      }

      const fromSiteId = type === "RETOUR" ? lot.destinationSiteId : lot.sourceSiteId;
      const toSiteId = type === "RETOUR" ? lot.sourceSiteId : lot.destinationSiteId;
      const temporaryReference = `TMP-${randomUUID()}`;
      const movement = await tx.transferMovement.create({
        data: {
          transferLotId: lot.id,
          reference: temporaryReference,
          type,
          occurredAt,
          fromSiteId,
          toSiteId,
          observations: parsed.data.observations || null,
          createdById: session.userId,
          items: {
            create: selected.map((item) => ({
              transferLotItemId: item.id,
              statusBefore: rule.before as TransferItemStatus,
              statusAfter: rule.after as TransferItemStatus,
            })),
          },
          signatures: {
            create: [
              {
                party: "MINISTERE",
                signatoryName: parsed.data.ministryName,
                signatoryTitle: parsed.data.ministryTitle,
                signatureData: parsed.data.ministrySignature,
                capturedById: session.userId,
                signedAt: occurredAt,
                ipAddress: ip,
              },
              {
                party: "CEIBAC",
                signatoryName: parsed.data.ceibacName,
                signatoryTitle: parsed.data.ceibacTitle,
                signatureData: parsed.data.ceibacSignature,
                capturedById: session.userId,
                signedAt: occurredAt,
                ipAddress: ip,
              },
            ],
          },
        },
      });
      const reference = `BTR-${new Date(occurredAt).getUTCFullYear()}-${String(movement.id).padStart(7, "0")}`;
      await tx.transferMovement.update({ where: { id: movement.id }, data: { reference } });

      const timestampData = type === "SORTIE"
        ? { departedAt: occurredAt }
        : type === "RECEPTION"
          ? { receivedAt: occurredAt }
          : { returnedAt: occurredAt };
      const updatedItems = await tx.transferLotItem.updateMany({
        where: { id: { in: itemIds }, transferLotId: lot.id, status: rule.before as TransferItemStatus },
        data: { status: rule.after as TransferItemStatus, ...timestampData },
      });
      if (updatedItems.count !== itemIds.length) throw new TransferRuleError("Le stock a changé pendant l'enregistrement. Réessayez.");

      const finalItems = await tx.transferLotItem.findMany({ where: { transferLotId: lot.id }, select: { status: true } });
      const nextStatus = deriveTransferLotStatus(
        finalItems.map((item) => item.status as TransferItemStatusCode),
        lot.status as TransferLotStatusCode,
      ) as TransferLotStatus;
      await tx.transferLot.update({ where: { id: lot.id }, data: { status: nextStatus } });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: `TRANSFER_${type}`,
          entity: "TRANSFER_MOVEMENT",
          entityId: movement.id,
          newValue: { reference, transferLotId: lot.id, itemCount: itemIds.length, status: nextStatus },
          ipAddress: ip,
        },
      });
      return { reference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/transferts/${lotId}`);
    revalidatePath("/transferts");
    return { success: true, message: `Le bordereau ${result.reference} est enregistré.` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre agent vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Transfer movement creation failed.", error);
    return { error: "Le mouvement n'a pas pu être enregistré." };
  }
}
