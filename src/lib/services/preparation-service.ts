import "server-only";
import { Prisma, type StatutPreparation } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { PreparationSearch } from "@/lib/validation/preparation";

export const PREPARATION_PAGE_SIZE = 20;
const PREPARATION_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

const STATUS_FILTERS: Record<PreparationSearch["statut"], StatutPreparation[] | undefined> = {
  A_TRAITER: ["EN_ATTENTE", "EN_COURS", "REJETE"],
  A_VALIDER: ["A_VALIDER"],
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
};

function getCartonWhere(token: string | undefined): Prisma.DossierWhereInput | null {
  if (!token) return null;
  if (token.startsWith("code:")) {
    const codeBarres = token.slice(5).trim();
    return codeBarres ? { codeBarres } : null;
  }
  if (token.startsWith("label:")) {
    const libelleCarton = token.slice(6).trim();
    return libelleCarton ? { codeBarres: null, libelleCarton } : null;
  }
  return null;
}

export async function getPreparationWorkspace(filters: PreparationSearch) {
  const where: Prisma.DossierWhereInput = {
    statutValidation: "VALIDE",
  };

  const statuses = STATUS_FILTERS[filters.statut];
  if (statuses) where.statutPreparation = { in: statuses };
  const cartonWhere = getCartonWhere(filters.carton);
  if (cartonWhere) where.AND = [cartonWhere];

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
  const activeCartonWhere: Prisma.DossierWhereInput = {
    statutValidation: "VALIDE",
    statutPreparation: { in: ["EN_ATTENTE", "EN_COURS", "REJETE"] },
    OR: filters.q
      ? [{ codeBarres: { contains: filters.q } }, { libelleCarton: { contains: filters.q } }]
      : [{ codeBarres: { not: null } }, { libelleCarton: { not: null } }],
  };

  const [items, total, grouped, activeCartons, selectedCartonItems] = await Promise.all([
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
    prisma.dossier.groupBy({
      by: ["codeBarres", "libelleCarton"],
      where: activeCartonWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 12,
    }),
    cartonWhere
      ? prisma.dossier.findMany({
          where: { statutValidation: "VALIDE", AND: [cartonWhere] },
          select: {
            statutPreparation: true,
            nombrePieces: true,
            nombrePages: true,
            preparateur: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const countByStatus = Object.fromEntries(
    grouped.map((row) => [row.statutPreparation, row._count._all]),
  ) as Partial<Record<StatutPreparation, number>>;

  const cartonChoiceMap = new Map<string, {
    key: string;
    label: string;
    description: string | null;
    dossierCount: number;
  }>();
  for (const carton of activeCartons) {
    const key = carton.codeBarres ? `code:${carton.codeBarres}` : `label:${carton.libelleCarton ?? ""}`;
    const existing = cartonChoiceMap.get(key);
    if (existing) {
      existing.dossierCount += carton._count._all;
      continue;
    }
    cartonChoiceMap.set(key, {
      key,
      label: carton.codeBarres ?? carton.libelleCarton ?? "Carton non identifié",
      description: carton.codeBarres && carton.libelleCarton ? carton.libelleCarton : null,
      dossierCount: carton._count._all,
    });
  }
  const cartonChoices = Array.from(cartonChoiceMap.values());

  const selectedCartonSummary = cartonWhere
    ? {
        totalDossiers: selectedCartonItems.length,
        renseignes: selectedCartonItems.filter((item) =>
          item.statutPreparation === "A_VALIDER" || item.statutPreparation === "TERMINE",
        ).length,
        enCours: selectedCartonItems.filter((item) => item.statutPreparation === "EN_COURS").length,
        restants: selectedCartonItems.filter((item) =>
          item.statutPreparation === "EN_ATTENTE" || item.statutPreparation === "REJETE",
        ).length,
        nombrePieces: selectedCartonItems.reduce((sum, item) => sum + (item.nombrePieces ?? 0), 0),
        nombrePages: selectedCartonItems.reduce((sum, item) => sum + (item.nombrePages ?? 0), 0),
        agents: Array.from(new Set(selectedCartonItems.flatMap((item) => item.preparateur?.name ? [item.preparateur.name] : []))).sort(),
      }
    : null;
  const claimCutoff = Date.now() - PREPARATION_CLAIM_TTL_MS;
  const workspaceItems = items.map((item) => ({
    ...item,
    preparationClaimExpired:
      item.statutPreparation === "EN_COURS" &&
      (!item.preparationClaimedAt || item.preparationClaimedAt.getTime() < claimCutoff),
  }));

  return {
    items: workspaceItems,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PREPARATION_PAGE_SIZE)),
    summary: {
      aTraiter: (countByStatus.EN_ATTENTE ?? 0) + (countByStatus.EN_COURS ?? 0) + (countByStatus.REJETE ?? 0),
      aValider: countByStatus.A_VALIDER ?? 0,
      termines: countByStatus.TERMINE ?? 0,
      rejetes: countByStatus.REJETE ?? 0,
    },
    cartonChoices,
    selectedCartonSummary,
  };
}

export type PreparationWorkspaceItem = Awaited<ReturnType<typeof getPreparationWorkspace>>["items"][number];
