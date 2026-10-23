import "server-only";

import type { Prisma, TransferLotStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import type { TransferValidationSearch } from "@/lib/validation/transfer-validation-search";

export const TRANSFER_VALIDATION_PAGE_SIZE = 25;

const pendingReceptionWhere = {
  type: "RECEPTION",
  status: "VALIDE_CEIBAC",
} satisfies Prisma.TransferMovementWhereInput;

const awaitingCeibacWhere = {
  type: "RECEPTION",
  status: "SOUMIS_CEIBAC",
} satisfies Prisma.TransferMovementWhereInput;

const movementStatusFilters: Record<TransferValidationSearch["statut"], Prisma.TransferMovementWhereInput> = {
  A_VALIDER: pendingReceptionWhere,
  ATTENTE_CEIBAC: awaitingCeibacWhere,
  VALIDES: { status: "VALIDE_MINISTERE" },
  TOUS: {},
};

type ValidationQuery = Pick<TransferValidationSearch, "q" | "page">;

async function getValidationWorkspaceData(
  lotStatus: TransferLotStatus,
  statusWhere: Prisma.TransferMovementWhereInput,
  filters: ValidationQuery,
) {
  const page = Math.min(1_000_000, Math.max(1, Number.isSafeInteger(filters.page) ? filters.page : 1));
  const q = filters.q?.trim();
  const where: Prisma.TransferMovementWhereInput = {
    ...statusWhere,
    ...(q ? {
      OR: [
        { reference: { contains: q } },
        { transferLot: { reference: { contains: q } } },
      ],
    } : {}),
  };

  const [lots, movements, total, pendingReceptions, awaitingCeibac] = await Promise.all([
    prisma.transferLot.findMany({
      where: { status: lotStatus },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        reference: true,
        createdAt: true,
        sourceSite: { select: { nom: true } },
        sourceEntrepot: { select: { nom: true, localisation: true } },
        destinationSite: { select: { nom: true } },
        destinationEntrepot: { select: { nom: true, localisation: true } },
        items: { select: { dossierCountSnapshot: true } },
      },
    }),
    prisma.transferMovement.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * TRANSFER_VALIDATION_PAGE_SIZE,
      take: TRANSFER_VALIDATION_PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        occurredAt: true,
        createdAt: true,
        transferLot: {
          select: {
            id: true,
            reference: true,
            sourceSite: { select: { nom: true } },
            destinationSite: { select: { nom: true } },
          },
        },
        items: { select: { transferLotItem: { select: { dossierCountSnapshot: true } } } },
        signatures: {
          orderBy: { signedAt: "asc" },
          select: { signatoryName: true, party: true, signedAt: true },
        },
      },
    }),
    prisma.transferMovement.count({ where }),
    prisma.transferMovement.count({ where: pendingReceptionWhere }),
    prisma.transferMovement.count({ where: awaitingCeibacWhere }),
  ]);

  return {
    lots: lots.map((lot) => ({
      id: lot.id,
      reference: lot.reference,
      createdAt: lot.createdAt,
      source: [lot.sourceSite.nom, lot.sourceEntrepot?.nom, lot.sourceEntrepot?.localisation].filter(Boolean).join(" · "),
      destination: [lot.destinationSite.nom, lot.destinationEntrepot?.nom, lot.destinationEntrepot?.localisation].filter(Boolean).join(" · "),
      dossierCount: lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0),
    })),
    movements: movements.map((movement) => ({
      ...movement,
      dossierCount: movement.items.reduce((sum, item) => sum + item.transferLotItem.dossierCountSnapshot, 0),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / TRANSFER_VALIDATION_PAGE_SIZE)),
    summary: { pendingLots: lots.length, pendingReceptions, awaitingCeibac },
  };
}

export async function getTransferValidationWorkspace(filters: TransferValidationSearch) {
  await requirePermission("TRANSFER_AUTHORIZE");
  return getValidationWorkspaceData("VALIDE_CEIBAC", movementStatusFilters[filters.statut], filters);
}

export async function getCeibacTransferValidationWorkspace(filters: ValidationQuery = { page: 1 }) {
  await requirePermission("TRANSFER_CEIBAC_APPROVE");
  return getValidationWorkspaceData("SOUMIS", awaitingCeibacWhere, filters);
}
