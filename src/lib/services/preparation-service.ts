import "server-only";
import { Prisma, type StatutPreparation } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { PreparationSearch } from "@/lib/validation/preparation";
import { buildCartonToken, cartonWhereFromToken, getCartonDisplay } from "@/lib/workflow/carton-identity";

export const PREPARATION_PAGE_SIZE = 20;
const PREPARATION_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

const STATUS_FILTERS: Record<PreparationSearch["statut"], StatutPreparation[] | undefined> = {
  A_TRAITER: ["EN_ATTENTE", "EN_COURS", "REJETE"],
  A_VALIDER: ["A_VALIDER"],
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
};

function buildSearchWhere(filters: PreparationSearch): Prisma.DossierWhereInput {
  const statuses = STATUS_FILTERS[filters.statut];
  const constraints: Prisma.DossierWhereInput[] = [
    { statutValidation: "VALIDE" },
    { OR: [{ codeBarres: { not: null } }, { libelleCarton: { not: null } }] },
  ];
  if (statuses) constraints.push({ statutPreparation: { in: statuses } });
  if (filters.q) {
    constraints.push({
      OR: [
        { reference: { contains: filters.q } },
        { codeBarres: { contains: filters.q } },
        { libelleCarton: { contains: filters.q } },
        { nom: { contains: filters.q } },
        { prenoms: { contains: filters.q } },
      ],
    });
  }
  return { AND: constraints };
}

export async function getPreparationWorkspace(filters: PreparationSearch) {
  const where = buildSearchWhere(filters);
  const selectedCartonWhere = filters.carton ? cartonWhereFromToken(filters.carton) : null;
  const page = Math.max(1, filters.page);
  const claimCutoff = Date.now() - PREPARATION_CLAIM_TTL_MS;

  const [rawGroups, grouped, selectedCartonItems, unidentifiedCount] = await Promise.all([
    prisma.dossier.groupBy({
      by: ["siteId", "codeBarres", "libelleCarton"],
      where,
      _count: { _all: true },
      orderBy: [{ siteId: "asc" }, { codeBarres: "asc" }, { libelleCarton: "asc" }],
    }),
    prisma.dossier.groupBy({
      by: ["statutPreparation"],
      where: { statutValidation: "VALIDE" },
      _count: { _all: true },
    }),
    selectedCartonWhere
      ? prisma.dossier.findMany({
          where: { statutValidation: "VALIDE", AND: [selectedCartonWhere] },
          orderBy: [{ reference: "asc" }],
          include: {
            operateur: { select: { nom: true, prenoms: true, matricule: true } },
            preparateur: { select: { id: true, name: true } },
            site: { select: { nom: true } },
          },
        })
      : Promise.resolve([]),
    prisma.dossier.count({
      where: {
        statutValidation: "VALIDE",
        codeBarres: null,
        libelleCarton: null,
        ...(STATUS_FILTERS[filters.statut]
          ? { statutPreparation: { in: STATUS_FILTERS[filters.statut] } }
          : {}),
      },
    }),
  ]);

  const mergedGroups = new Map<string, {
    token: string;
    siteId: number | null;
    codeBarres: string | null;
    libelleCarton: string | null;
    totalDossiers: number;
  }>();
  for (const group of rawGroups) {
    const token = buildCartonToken(group);
    if (!token) continue;
    const existing = mergedGroups.get(token);
    if (existing) {
      existing.totalDossiers += group._count._all;
      if (!existing.libelleCarton && group.libelleCarton) existing.libelleCarton = group.libelleCarton;
    } else {
      mergedGroups.set(token, {
        token,
        siteId: group.siteId,
        codeBarres: group.codeBarres,
        libelleCarton: group.libelleCarton,
        totalDossiers: group._count._all,
      });
    }
  }

  const allCartons = Array.from(mergedGroups.values());
  const total = allCartons.length;
  const pageGroups = allCartons.slice((page - 1) * PREPARATION_PAGE_SIZE, page * PREPARATION_PAGE_SIZE);
  const pageWheres = pageGroups
    .map((group) => cartonWhereFromToken(group.token))
    .filter((item): item is Prisma.DossierWhereInput => item !== null);
  const pageDossiers = pageWheres.length > 0
    ? await prisma.dossier.findMany({
        where: { AND: [where, { OR: pageWheres }] },
        select: {
          id: true,
          siteId: true,
          codeBarres: true,
          libelleCarton: true,
          statutPreparation: true,
          preparateurId: true,
          preparationClaimedAt: true,
          preparateur: { select: { name: true } },
          site: { select: { nom: true } },
        },
      })
    : [];

  const cartons = pageGroups.map((group) => {
    const dossiers = pageDossiers.filter((dossier) => buildCartonToken(dossier) === group.token);
    const display = getCartonDisplay(group);
    const agents = Array.from(new Set(dossiers.flatMap((item) => item.preparateur?.name ? [item.preparateur.name] : []))).sort();
    return {
      ...group,
      ...display,
      site: dossiers[0]?.site?.nom ?? "Site à confirmer",
      aPreparer: dossiers.filter((item) => item.statutPreparation === "EN_ATTENTE" || item.statutPreparation === "REJETE").length,
      enCours: dossiers.filter((item) => item.statutPreparation === "EN_COURS").length,
      aControler: dossiers.filter((item) => item.statutPreparation === "A_VALIDER").length,
      termines: dossiers.filter((item) => item.statutPreparation === "TERMINE").length,
      agents,
      activeClaimUserIds: Array.from(new Set(dossiers.flatMap((item) =>
        item.statutPreparation === "EN_COURS" &&
        item.preparateurId &&
        item.preparationClaimedAt &&
        item.preparationClaimedAt.getTime() >= claimCutoff
          ? [item.preparateurId]
          : [],
      ))),
    };
  });

  const countByStatus = Object.fromEntries(
    grouped.map((row) => [row.statutPreparation, row._count._all]),
  ) as Partial<Record<StatutPreparation, number>>;
  const selectedCartonSummary = selectedCartonWhere
    ? {
        totalDossiers: selectedCartonItems.length,
        renseignes: selectedCartonItems.filter((item) => item.statutPreparation === "A_VALIDER" || item.statutPreparation === "TERMINE").length,
        enCours: selectedCartonItems.filter((item) => item.statutPreparation === "EN_COURS").length,
        restants: selectedCartonItems.filter((item) => item.statutPreparation === "EN_ATTENTE" || item.statutPreparation === "REJETE").length,
        nombrePieces: selectedCartonItems.reduce((sum, item) => sum + (item.nombrePieces ?? 0), 0),
        nombrePages: selectedCartonItems.reduce((sum, item) => sum + (item.nombrePages ?? 0), 0),
        agents: Array.from(new Set(selectedCartonItems.flatMap((item) => item.preparateur?.name ? [item.preparateur.name] : []))).sort(),
      }
    : null;

  return {
    cartons,
    selectedCartonItems: selectedCartonItems.map((item) => ({
      ...item,
      preparationClaimExpired:
        item.statutPreparation === "EN_COURS" &&
        (!item.preparationClaimedAt || item.preparationClaimedAt.getTime() < claimCutoff),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PREPARATION_PAGE_SIZE)),
    unidentifiedCount,
    summary: {
      aTraiter: (countByStatus.EN_ATTENTE ?? 0) + (countByStatus.EN_COURS ?? 0) + (countByStatus.REJETE ?? 0),
      aValider: countByStatus.A_VALIDER ?? 0,
      termines: countByStatus.TERMINE ?? 0,
      rejetes: countByStatus.REJETE ?? 0,
    },
    selectedCartonSummary,
  };
}

export type PreparationCartonItem = Awaited<ReturnType<typeof getPreparationWorkspace>>["cartons"][number];
export type PreparationWorkspaceItem = Awaited<ReturnType<typeof getPreparationWorkspace>>["selectedCartonItems"][number];
