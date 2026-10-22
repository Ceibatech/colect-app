import "server-only";
import { Prisma, type StatutPreparation } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { PreparationSearch } from "@/lib/validation/preparation";

export const PREPARATION_PAGE_SIZE = 20;

const STATUS_FILTERS: Record<PreparationSearch["statut"], StatutPreparation[] | undefined> = {
  A_TRAITER: ["EN_ATTENTE", "REJETE"],
  A_VALIDER: ["A_VALIDER"],
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
};

export async function getPreparationWorkspace(filters: PreparationSearch) {
  const where: Prisma.DossierWhereInput = {
    statutValidation: "VALIDE",
  };

  const statuses = STATUS_FILTERS[filters.statut];
  if (statuses) where.statutPreparation = { in: statuses };

  if (filters.q) {
    where.OR = [
      { reference: { contains: filters.q } },
      { codeBarres: { contains: filters.q } },
      { libelleCarton: { contains: filters.q } },
      { nom: { contains: filters.q } },
      { prenoms: { contains: filters.q } },
    ];
  }

  const page = Math.max(1, filters.page);
  const skip = (page - 1) * PREPARATION_PAGE_SIZE;
  const baseWhere: Prisma.DossierWhereInput = { statutValidation: "VALIDE" };

  const [items, total, grouped] = await Promise.all([
    prisma.dossier.findMany({
      where,
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip,
      take: PREPARATION_PAGE_SIZE,
      include: {
        operateur: { select: { nom: true, prenoms: true, matricule: true } },
        preparateur: { select: { name: true } },
        site: { select: { nom: true } },
      },
    }),
    prisma.dossier.count({ where }),
    prisma.dossier.groupBy({
      by: ["statutPreparation"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    grouped.map((row) => [row.statutPreparation, row._count._all]),
  ) as Partial<Record<StatutPreparation, number>>;

  return {
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PREPARATION_PAGE_SIZE)),
    summary: {
      aTraiter: (countByStatus.EN_ATTENTE ?? 0) + (countByStatus.REJETE ?? 0),
      aValider: countByStatus.A_VALIDER ?? 0,
      termines: countByStatus.TERMINE ?? 0,
      rejetes: countByStatus.REJETE ?? 0,
    },
  };
}

export type PreparationWorkspaceItem = Awaited<ReturnType<typeof getPreparationWorkspace>>["items"][number];
