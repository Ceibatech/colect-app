import "server-only";
import { prisma } from "@/lib/prisma/client";
import { Prisma } from "@prisma/client";
import type {
  StatutCollecte,
  StatutValidation,
  StatutNumerisation,
  StatutIndexation,
  StatutArchivage,
} from "@prisma/client";

export interface DossierSearchFilters {
  q?: string;
  communeId?: number;
  lotissementId?: number;
  natureDossierId?: number;
  operateurId?: number;
  statutCollecte?: StatutCollecte;
  statutValidation?: StatutValidation;
  statutNumerisation?: StatutNumerisation;
  statutIndexation?: StatutIndexation;
  statutArchivage?: StatutArchivage;
  dateFrom?: Date;
  dateTo?: Date;
}

export type DossierSortKey = "createdAt" | "reference" | "nom" | "commune";

export interface DossierSearchOptions {
  page: number;
  pageSize: number;
  sort: DossierSortKey;
  dir: "asc" | "desc";
}

const ORDER_BY_MAP: Record<DossierSortKey, (dir: "asc" | "desc") => Prisma.DossierOrderByWithRelationInput> = {
  createdAt: (dir) => ({ createdAt: dir }),
  reference: (dir) => ({ reference: dir }),
  nom: (dir) => ({ nom: dir }),
  commune: (dir) => ({ commune: { nom: dir } }),
};

export const DOSSIERS_PAGE_SIZE = 20;

export async function searchDossiers(filters: DossierSearchFilters, options: DossierSearchOptions) {
  const where: Prisma.DossierWhereInput = {};

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { reference: { contains: q } },
        { codeBarres: { contains: q } },
        { numeroDdu: { contains: q } },
        { numeroGuichet: { contains: q } },
        { referenceClassement: { contains: q } },
        { numeroIlot: { contains: q } },
        { numeroLot: { contains: q } },
        { numeroTitreFoncier: { contains: q } },
        { nom: { contains: q } },
        { prenoms: { contains: q } },
      ];
    }
  }
  if (filters.communeId) where.communeId = filters.communeId;
  if (filters.lotissementId) where.lotissementId = filters.lotissementId;
  if (filters.natureDossierId) where.natureDossierId = filters.natureDossierId;
  if (filters.operateurId) where.operateurId = filters.operateurId;
  if (filters.statutCollecte) where.statutCollecte = filters.statutCollecte;
  if (filters.statutValidation) where.statutValidation = filters.statutValidation;
  if (filters.statutNumerisation) where.statutNumerisation = filters.statutNumerisation;
  if (filters.statutIndexation) where.statutIndexation = filters.statutIndexation;
  if (filters.statutArchivage) where.statutArchivage = filters.statutArchivage;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const pageSize = options.pageSize;
  const page = Math.max(1, options.page);
  const skip = (page - 1) * pageSize;
  const orderBy = ORDER_BY_MAP[options.sort](options.dir);

  const [items, total] = await Promise.all([
    prisma.dossier.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        commune: { select: { id: true, nom: true } },
        natureDossier: { select: { id: true, libelle: true } },
        operateur: { select: { id: true, nom: true, prenoms: true } },
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

export type DossierListItem = Awaited<ReturnType<typeof searchDossiers>>["items"][number];

export async function getDossierDetail(id: number) {
  return prisma.dossier.findUnique({
    where: { id },
    include: {
      commune: true,
      lotissement: true,
      natureDossier: true,
      operateur: true,
      history: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      numerisations: { orderBy: { createdAt: "desc" } },
      indexations: { orderBy: { createdAt: "desc" } },
      archivages: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      qualityChecks: { orderBy: { createdAt: "desc" }, include: { anomalies: true } },
    },
  });
}
