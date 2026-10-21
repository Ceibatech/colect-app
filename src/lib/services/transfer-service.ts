import "server-only";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { encodeTransferCartonKey } from "@/lib/utils/transfer-carton-key";
import {
  getTransferStockSummary,
  type TransferItemStatusCode,
} from "@/lib/utils/transfer-stock";

export interface TransferCartonOption {
  key: string;
  code: string;
  label: string | null;
  siteId: number;
  entrepotId: number | null;
  dossierCount: number;
  dossierReferences: string[];
}

export async function getTransferCreateData() {
  await requirePermission("TRANSFER_CREATE");
  const [sites, dossiers, reservedItems] = await Promise.all([
    prisma.site.findMany({
      where: { isActive: true },
      orderBy: { nom: "asc" },
      select: {
        id: true,
        code: true,
        nom: true,
        entrepots: {
          where: { isActive: true },
          orderBy: { nom: "asc" },
          select: { id: true, code: true, nom: true },
        },
      },
    }),
    prisma.dossier.findMany({
      where: { siteId: { not: null }, codeBarres: { not: null } },
      orderBy: [{ siteId: "asc" }, { entrepotId: "asc" }, { codeBarres: "asc" }],
      select: {
        id: true,
        reference: true,
        siteId: true,
        entrepotId: true,
        codeBarres: true,
        libelleCarton: true,
        statutPreparation: true,
      },
    }),
    prisma.transferLotItem.findMany({
      where: {
        status: { not: "RETOURNE" },
        transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
      },
      select: {
        cartonCode: true,
        transferLot: { select: { sourceSiteId: true, sourceEntrepotId: true } },
      },
    }),
  ]);

  const reserved = new Set(
    reservedItems.map((item) => `${item.transferLot.sourceSiteId}:${item.transferLot.sourceEntrepotId ?? 0}:${item.cartonCode}`),
  );
  const grouped = new Map<string, typeof dossiers>();
  for (const dossier of dossiers) {
    if (!dossier.siteId || !dossier.codeBarres) continue;
    const groupKey = `${dossier.siteId}:${dossier.entrepotId ?? 0}:${dossier.codeBarres}`;
    const group = grouped.get(groupKey) ?? [];
    group.push(dossier);
    grouped.set(groupKey, group);
  }

  const cartons: TransferCartonOption[] = [];
  for (const [groupKey, group] of grouped) {
    if (reserved.has(groupKey) || group.some((dossier) => dossier.statutPreparation !== "TERMINE")) continue;
    const first = group[0];
    if (!first.siteId || !first.codeBarres) continue;
    cartons.push({
      key: encodeTransferCartonKey({ siteId: first.siteId, entrepotId: first.entrepotId, cartonCode: first.codeBarres }),
      code: first.codeBarres,
      label: first.libelleCarton,
      siteId: first.siteId,
      entrepotId: first.entrepotId,
      dossierCount: group.length,
      dossierReferences: group.slice(0, 4).map((dossier) => dossier.reference),
    });
  }

  return { sites, cartons };
}

export async function getTransferDashboardData() {
  await requirePermission("TRANSFER_VIEW");
  const inventoryWhere = { siteId: { not: null }, codeBarres: { not: null } } as const;
  const [lots, identifiedCartons, identifiedDossiers, activeCustodyItems] = await Promise.all([
    prisma.transferLot.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceSite: { select: { nom: true, code: true } },
        sourceEntrepot: { select: { nom: true, code: true } },
        destinationSite: { select: { nom: true, code: true } },
        destinationEntrepot: { select: { nom: true, code: true } },
        createdBy: { select: { name: true } },
        items: { select: { status: true, dossierCountSnapshot: true } },
        _count: { select: { movements: true } },
      },
    }),
    prisma.dossier.groupBy({
      by: ["siteId", "entrepotId", "codeBarres"],
      where: inventoryWhere,
    }),
    prisma.dossier.count({ where: inventoryWhere }),
    prisma.transferLotItem.findMany({
      where: {
        status: { in: ["SORTI", "RECU"] },
        transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
      },
      select: { status: true },
    }),
  ]);

  const rows = lots.map((lot) => ({
    id: lot.id,
    reference: lot.reference,
    status: lot.status,
    source: lot.sourceEntrepot ? `${lot.sourceSite.nom} · ${lot.sourceEntrepot.nom}` : lot.sourceSite.nom,
    destination: lot.destinationEntrepot ? `${lot.destinationSite.nom} · ${lot.destinationEntrepot.nom}` : lot.destinationSite.nom,
    plannedAt: lot.plannedAt,
    createdAt: lot.createdAt,
    createdBy: lot.createdBy.name,
    movementCount: lot._count.movements,
    dossierCount: lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0),
    stock: getTransferStockSummary(lot.items.map((item) => item.status as TransferItemStatusCode)),
  }));

  const inTransit = activeCustodyItems.filter((item) => item.status === "SORTI").length;
  const atCeibac = activeCustodyItems.filter((item) => item.status === "RECU").length;
  const outsideOrigin = inTransit + atCeibac;
  const totalCartons = identifiedCartons.length;

  return {
    rows,
    summary: {
      lots: rows.length,
      open: rows.filter((row) => !["CLOTURE", "ANNULE"].includes(row.status)).length,
      totalCartons,
      identifiedDossiers,
      onSite: Math.max(totalCartons - outsideOrigin, 0),
      outsideOrigin,
      inTransit,
      atCeibac,
    },
  };
}

export async function getTransferLotDetail(id: number) {
  await requirePermission("TRANSFER_VIEW");
  return prisma.transferLot.findUnique({
    where: { id },
    include: {
      sourceSite: true,
      sourceEntrepot: true,
      destinationSite: true,
      destinationEntrepot: true,
      createdBy: { select: { id: true, name: true } },
      authorizedBy: { select: { id: true, name: true } },
      items: {
        orderBy: { cartonCode: "asc" },
        include: {
          dossiers: {
            orderBy: { dossier: { reference: "asc" } },
            include: { dossier: { select: { id: true, reference: true, nom: true, prenoms: true } } },
          },
        },
      },
      movements: {
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          items: { include: { transferLotItem: { select: { id: true, cartonCode: true, cartonLabel: true } } } },
          signatures: { select: { party: true, signatoryName: true, signatoryTitle: true, signedAt: true } },
        },
      },
    },
  });
}

export async function getTransferBordereau(lotId: number, movementId: number) {
  await requirePermission("TRANSFER_VIEW");
  return prisma.transferMovement.findFirst({
    where: { id: movementId, transferLotId: lotId },
    include: {
      transferLot: {
        include: {
          sourceSite: true,
          sourceEntrepot: true,
          destinationSite: true,
          destinationEntrepot: true,
        },
      },
      createdBy: { select: { name: true } },
      items: {
        orderBy: { transferLotItem: { cartonCode: "asc" } },
        include: {
          transferLotItem: {
            include: {
              dossiers: { include: { dossier: { select: { reference: true } } } },
            },
          },
        },
      },
      signatures: { orderBy: { party: "asc" } },
    },
  });
}
