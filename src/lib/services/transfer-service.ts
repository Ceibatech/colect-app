import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import {
  getTransferDossierStockSummary,
  type TransferItemStatusCode,
} from "@/lib/utils/transfer-stock";

export interface TransferDossierSearchOptions {
  sourceSiteId: number;
  sourceEntrepotId: number | null;
  includeUnlocated?: boolean;
  q?: string;
  page: number;
  pageSize?: number;
}

export async function getTransferCreateData() {
  await requirePermission("TRANSFER_CREATE");
  const [sites, totalDossiers] = await Promise.all([
    prisma.site.findMany({
      where: { isActive: true, organisation: { in: ["MINISTERE", "CEIBA"] } },
      orderBy: { nom: "asc" },
      select: {
        id: true,
        code: true,
        nom: true,
        organisation: true,
        entrepots: {
          where: { isActive: true },
          orderBy: { nom: "asc" },
          select: { id: true, code: true, nom: true, localisation: true },
        },
      },
    }),
    prisma.dossier.count(),
  ]);

  return { sites, totalDossiers };
}

export async function searchTransferDossiers(options: TransferDossierSearchOptions) {
  const pageSize = Math.min(Math.max(options.pageSize ?? 40, 1), 100);
  const page = Math.max(options.page, 1);
  const query = options.q?.trim();
  const locationWhere: Prisma.DossierWhereInput = options.includeUnlocated
    ? {
        OR: [
          { siteId: options.sourceSiteId, entrepotId: options.sourceEntrepotId },
          { siteId: null },
        ],
      }
    : { siteId: options.sourceSiteId, entrepotId: options.sourceEntrepotId };
  const where: Prisma.DossierWhereInput = {
    AND: [
      locationWhere,
      {
        transferLotDossiers: {
          none: {
            transferLotItem: {
              status: { in: ["PREVU", "SORTI"] },
              transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
            },
          },
        },
      },
      ...(query ? [{
        OR: [
          { reference: { contains: query } },
          { codeBarres: { contains: query } },
          { libelleCarton: { contains: query } },
          { nom: { contains: query } },
          { prenoms: { contains: query } },
          { numeroDdu: { contains: query } },
          { referenceClassement: { contains: query } },
        ],
      }] : []),
    ],
  };

  const [items, total] = await Promise.all([
    prisma.dossier.findMany({
      where,
      orderBy: [{ reference: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        siteId: true,
        codeBarres: true,
        libelleCarton: true,
        nom: true,
        prenoms: true,
        statutPreparation: true,
        commune: { select: { nom: true } },
        natureDossier: { select: { libelle: true } },
        operateur: { select: { matricule: true, nom: true, prenoms: true } },
      },
    }),
    prisma.dossier.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getTransferDashboardData() {
  await requirePermission("TRANSFER_VIEW");
  const [lots, sites, stockBySite, totalDossiers, onSite, activeItems, inTransitLinks] = await Promise.all([
    prisma.transferLot.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceSite: { select: { nom: true, code: true } },
        sourceEntrepot: { select: { nom: true, code: true, localisation: true } },
        destinationSite: { select: { nom: true, code: true } },
        destinationEntrepot: { select: { nom: true, code: true, localisation: true } },
        createdBy: { select: { name: true } },
        items: { select: { status: true, dossierCountSnapshot: true } },
        movements: {
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          select: { id: true, reference: true, type: true, status: true, occurredAt: true },
        },
      },
    }),
    prisma.site.findMany({
      where: { isActive: true },
      orderBy: { nom: "asc" },
      select: { id: true, code: true, nom: true, organisation: true },
    }),
    prisma.dossier.groupBy({ by: ["siteId"], where: { siteId: { not: null } }, _count: { _all: true } }),
    prisma.dossier.count(),
    prisma.dossier.count({ where: { siteId: { not: null } } }),
    prisma.transferLotItem.findMany({
      where: {
        status: { in: ["PREVU", "SORTI"] },
        transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
      },
      select: {
        status: true,
        dossierCountSnapshot: true,
        transferLot: { select: { sourceSiteId: true, destinationSiteId: true } },
      },
    }),
    prisma.transferLotDossier.findMany({
      where: { transferLotItem: { status: "SORTI", transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } } } },
      distinct: ["dossierId"],
      select: { dossierId: true },
    }),
  ]);

  const rows = lots.map((lot) => ({
    id: lot.id,
    reference: lot.reference,
    status: lot.status,
    sourceSiteId: lot.sourceSiteId,
    sourceEntrepotId: lot.sourceEntrepotId,
    destinationSiteId: lot.destinationSiteId,
    destinationEntrepotId: lot.destinationEntrepotId,
    source: lot.sourceEntrepot ? [lot.sourceSite.nom, lot.sourceEntrepot.nom, lot.sourceEntrepot.localisation].filter(Boolean).join(" · ") : lot.sourceSite.nom,
    destination: lot.destinationEntrepot ? [lot.destinationSite.nom, lot.destinationEntrepot.nom, lot.destinationEntrepot.localisation].filter(Boolean).join(" · ") : lot.destinationSite.nom,
    plannedAt: lot.plannedAt,
    authorizedAt: lot.authorizedAt,
    createdAt: lot.createdAt,
    createdBy: lot.createdBy.name,
    movementCount: lot.movements.length,
    movements: lot.movements,
    cartonCount: lot.items.length,
    dossierCount: lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0),
    stock: getTransferDossierStockSummary(lot.items.map((item) => ({
      status: item.status as TransferItemStatusCode,
      dossierCountSnapshot: item.dossierCountSnapshot,
    }))),
  }));

  const actualStock = new Map(stockBySite.flatMap((row) => row.siteId ? [[row.siteId, row._count._all] as const] : []));
  const plannedOutbound = new Map<number, number>();
  const transitOutbound = new Map<number, number>();
  const transitInbound = new Map<number, number>();
  for (const item of activeItems) {
    const sourceId = item.transferLot.sourceSiteId;
    const destinationId = item.transferLot.destinationSiteId;
    if (item.status === "PREVU") plannedOutbound.set(sourceId, (plannedOutbound.get(sourceId) ?? 0) + item.dossierCountSnapshot);
    if (item.status === "SORTI") {
      transitOutbound.set(sourceId, (transitOutbound.get(sourceId) ?? 0) + item.dossierCountSnapshot);
      transitInbound.set(destinationId, (transitInbound.get(destinationId) ?? 0) + item.dossierCountSnapshot);
    }
  }
  const siteStock = sites.map((site) => ({
    ...site,
    onSite: actualStock.get(site.id) ?? 0,
    plannedOutbound: plannedOutbound.get(site.id) ?? 0,
    transitOutbound: transitOutbound.get(site.id) ?? 0,
    transitInbound: transitInbound.get(site.id) ?? 0,
  }));
  const inTransit = inTransitLinks.length;

  return {
    rows,
    siteStock,
    summary: {
      lots: rows.length,
      open: rows.filter((row) => ["BROUILLON", "SOUMIS", "VALIDE_CEIBAC", "AUTORISE", "PARTIELLEMENT_SORTI", "EN_TRANSIT", "RECU_PARTIEL", "RETOUR_PARTIEL"].includes(row.status)).length,
      totalDossiers,
      onSite,
      inTransit,
      unlocated: Math.max(totalDossiers - onSite - inTransit, 0),
    },
  };
}

export async function getTransferAuthorization(lotId: number) {
  await requirePermission("TRANSFER_VIEW");
  return prisma.transferLot.findFirst({
    where: { id: lotId },
    include: {
      sourceSite: true,
      sourceEntrepot: true,
      destinationSite: true,
      destinationEntrepot: true,
      createdBy: { select: { name: true } },
      authorizedBy: { select: { name: true } },
      items: {
        orderBy: { cartonCode: "asc" },
        include: { dossiers: { include: { dossier: { select: { reference: true, nom: true, prenoms: true } } } } },
      },
    },
  });
}

export interface TransferAuthorizationGroupQuery {
  date: string;
  sourceSiteId: number;
  sourceEntrepotId: number | null;
  destinationSiteId: number;
  destinationEntrepotId: number | null;
}

export async function getTransferAuthorizationGroup(input: TransferAuthorizationGroupQuery) {
  await requirePermission("TRANSFER_VIEW");
  const start = new Date(`${input.date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const lots = await prisma.transferLot.findMany({
    where: {
      plannedAt: { gte: start, lt: end },
      sourceSiteId: input.sourceSiteId,
      sourceEntrepotId: input.sourceEntrepotId,
      destinationSiteId: input.destinationSiteId,
      destinationEntrepotId: input.destinationEntrepotId,
      status: { not: "ANNULE" },
    },
    orderBy: { reference: "asc" },
    include: {
      sourceSite: true,
      sourceEntrepot: true,
      destinationSite: true,
      destinationEntrepot: true,
      createdBy: { select: { name: true } },
      authorizedBy: { select: { name: true } },
      items: {
        orderBy: { cartonCode: "asc" },
        include: { dossiers: { include: { dossier: { select: { reference: true } } } } },
      },
    },
  });

  if (lots.length === 0) return null;
  return {
    ready: lots.every((lot) => Boolean(lot.authorizedAt)),
    reference: buildOperationReference(input.date, lots[0].sourceSite.code, lots[0].destinationSite.code),
    plannedAt: start,
    authorizedAt: latestDate(lots.flatMap((lot) => lot.authorizedAt ? [lot.authorizedAt] : [])),
    motif: Array.from(new Set(lots.map((lot) => lot.motif?.trim()).filter((value): value is string => Boolean(value)))).join(" / ") || null,
    archiveSupport: mergeArchiveSupports(lots.map((lot) => lot.archiveSupport)),
    plannedRoute: uniqueJoined(lots.map((lot) => lot.plannedRoute)),
    transportMethod: uniqueJoined(lots.map((lot) => lot.transportMethod)),
    ceibaParticipants: uniqueJoined(lots.map((lot) => lot.ceibaParticipants)),
    sdaParticipants: uniqueJoined(lots.map((lot) => lot.sdaParticipants)),
    riskAssessment: uniqueJoined(lots.map((lot) => lot.riskAssessment), " / "),
    securityMeasures: uniqueJoined(lots.map((lot) => lot.securityMeasures), " / "),
    sourceSite: lots[0].sourceSite,
    sourceEntrepot: lots[0].sourceEntrepot,
    destinationSite: lots[0].destinationSite,
    destinationEntrepot: lots[0].destinationEntrepot,
    lotReferences: lots.map((lot) => lot.reference),
    ceibaContacts: Array.from(new Set(lots.map((lot) => lot.createdBy.name))),
    items: lots.flatMap((lot) => lot.items.map((item) => ({ ...item, lotReference: lot.reference }))),
    ceibaSignatures: lots.map((lot) => ({
      reference: lot.reference,
      name: lot.ceibacSignatoryName,
      title: lot.ceibacSignatoryTitle,
      signedAt: lot.ceibacValidatedAt,
      data: lot.ceibacSignatureData,
    })),
    ministrySignatures: lots.map((lot) => ({
      reference: lot.reference,
      name: lot.approvalSignatoryName ?? lot.authorizedBy?.name ?? null,
      title: lot.approvalSignatoryTitle,
      signedAt: lot.authorizedAt,
      data: lot.approvalSignatureData,
    })),
  };
}

function buildOperationReference(date: string, sourceCode: string, destinationCode: string) {
  const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
  return `TRF-${date.replaceAll("-", "")}-${clean(sourceCode)}-${clean(destinationCode)}`;
}

function latestDate(values: Date[]) {
  return values.length > 0 ? new Date(Math.max(...values.map((value) => value.getTime()))) : null;
}

function uniqueJoined(values: Array<string | null>, separator = ", ") {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).join(separator) || null;
}

function mergeArchiveSupports(values: Array<string | null>) {
  const supports = new Set(values.filter((value): value is string => Boolean(value)));
  if (supports.size === 0) return null;
  return supports.size === 1 ? Array.from(supports)[0] : "HYBRIDE";
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
          items: { include: { transferLotItem: { select: { id: true, cartonCode: true, cartonLabel: true, dossierCountSnapshot: true } } } },
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
