import "server-only";
import { Prisma, type StatutArchivage, type StatutConditionnement, type StatutIndexation, type StatutNumerisation } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import type { ProductionQueueSearch } from "@/lib/validation/production-queue";
import { buildCartonToken, cartonWhereFromToken, getCartonDisplay } from "@/lib/workflow/carton-identity";
import { parseCartonReference } from "@/lib/cartons/reference";
import { parseCote } from "@/lib/cartons/cote";

const PAGE_SIZE = 20;

type GroupSeed = {
  token: string;
  cartonId: number | null;
  cartonCote?: string | null;
  siteId: number | null;
  codeBarres: string | null;
  libelleCarton: string | null;
  totalDossiers: number;
};

async function getCartonPage(where: Prisma.DossierWhereInput, page: number) {
  const rawGroups = await prisma.dossier.groupBy({
    by: ["cartonId", "siteId", "codeBarres", "libelleCarton"],
    where,
    _count: { _all: true },
    orderBy: [{ siteId: "asc" }, { codeBarres: "asc" }, { libelleCarton: "asc" }],
  });
  const merged = new Map<string, GroupSeed>();
  for (const group of rawGroups) {
    const token = buildCartonToken(group);
    if (!token) continue;
    const current = merged.get(token);
    if (current) {
      current.totalDossiers += group._count._all;
      if (!current.libelleCarton && group.libelleCarton) current.libelleCarton = group.libelleCarton;
    } else {
      merged.set(token, {
        token,
        cartonId: group.cartonId,
        siteId: group.siteId,
        codeBarres: group.codeBarres,
        libelleCarton: group.libelleCarton,
        totalDossiers: group._count._all,
      });
    }
  }
  const groups = Array.from(merged.values());
  const pageGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  await attachCartonCotes(pageGroups);
  return {
    groups: pageGroups,
    total: groups.length,
    totalPages: Math.max(1, Math.ceil(groups.length / PAGE_SIZE)),
  };
}

/** Cote du référentiel de chaque carton, pour l'affichage (à la place du CTN). */
export async function attachCartonCotes<T extends { cartonId: number | null; cartonCote?: string | null }>(groups: T[]) {
  const ids = [...new Set(groups.flatMap((group) => (group.cartonId ? [group.cartonId] : [])))];
  if (!ids.length) return groups;
  const cotes = new Map((await prisma.carton.findMany({ where: { id: { in: ids } }, select: { id: true, cote: true } })).map((c) => [c.id, c.cote]));
  for (const group of groups) if (group.cartonId) group.cartonCote = cotes.get(group.cartonId) ?? null;
  return groups;
}

function searchConstraint(q?: string): Prisma.DossierWhereInput[] {
  const cartonId = q ? parseCartonReference(q) : null;
  const cote = q ? parseCote(q) : null;
  return [
    { OR: [{ cartonId: { not: null } }, { codeBarres: { not: null } }, { libelleCarton: { not: null } }] },
    ...(q ? [cartonId !== null ? { cartonId } : cote ? { carton: { cote: cote.carton } } : { OR: [
      { cote: { contains: q } },
      { reference: { contains: q } },
      { codeBarres: { contains: q } },
      { libelleCarton: { contains: q } },
      { nom: { contains: q } },
      { prenoms: { contains: q } },
    ] }] : []),
  ];
}

const NUMERISATION_STATUS: Record<ProductionQueueSearch["statut"], StatutNumerisation[] | undefined> = {
  A_TRAITER: ["EN_ATTENTE", "EN_COURS", "REJETE"],
  A_CONTROLER: ["A_VALIDER"],
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
};

export async function getNumerisationWorkspace(filters: ProductionQueueSearch) {
  const constraints: Prisma.DossierWhereInput[] = [
    { statutPreparation: "TERMINE" },
    ...searchConstraint(filters.q),
  ];
  const statuses = NUMERISATION_STATUS[filters.statut];
  if (statuses) constraints.push({ statutNumerisation: { in: statuses } });
  const where: Prisma.DossierWhereInput = { AND: constraints };
  const page = Math.max(1, filters.page);
  const groupedPage = await getCartonPage(where, page);
  const pageWheres = groupedPage.groups.flatMap((group) => {
    const parsed = cartonWhereFromToken(group.token);
    return parsed ? [parsed] : [];
  });
  const selectedWhere = filters.carton ? cartonWhereFromToken(filters.carton) : null;

  const [pageDossiers, selectedItems, grouped] = await Promise.all([
    pageWheres.length > 0
      ? prisma.dossier.findMany({
          where: { AND: [where, { OR: pageWheres }] },
          select: {
            id: true,
            cartonId: true,
            siteId: true,
            codeBarres: true,
            libelleCarton: true,
            statutNumerisation: true,
            site: { select: { nom: true } },
            documents: { select: { uploadedBy: true, uploader: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    selectedWhere
      ? prisma.dossier.findMany({
          where: { statutPreparation: "TERMINE", AND: [selectedWhere] },
          orderBy: { reference: "asc" },
          select: {
            id: true,
            cartonId: true,
            reference: true,
            nom: true,
            prenoms: true,
            codeBarres: true,
            libelleCarton: true,
            statutNumerisation: true,
            nombrePages: true,
            documents: {
              orderBy: { createdAt: "desc" },
              select: { id: true, nomOriginal: true, taille: true, createdAt: true, uploadedBy: true, uploader: { select: { name: true } } },
            },
          },
        })
      : Promise.resolve([]),
    prisma.dossier.groupBy({
      by: ["statutNumerisation"],
      where: { statutPreparation: "TERMINE" },
      _count: { _all: true },
    }),
  ]);

  const cartons = groupedPage.groups.map((group) => {
    const dossiers = pageDossiers.filter((dossier) => buildCartonToken(dossier) === group.token);
    const uploaders = Array.from(new Set(dossiers.flatMap((dossier) => dossier.documents.map((document) => document.uploader?.name).filter((name): name is string => Boolean(name))))).sort();
    return {
      ...group,
      ...getCartonDisplay(group),
      site: dossiers[0]?.site?.nom ?? "Site à confirmer",
      aNumeriser: dossiers.filter((item) => ["EN_ATTENTE", "EN_COURS", "REJETE"].includes(item.statutNumerisation)).length,
      aControler: dossiers.filter((item) => item.statutNumerisation === "A_VALIDER").length,
      termines: dossiers.filter((item) => item.statutNumerisation === "TERMINE").length,
      documentCount: dossiers.reduce((sum, item) => sum + item.documents.length, 0),
      uploaders,
    };
  });
  const counts = Object.fromEntries(grouped.map((row) => [row.statutNumerisation, row._count._all])) as Partial<Record<StatutNumerisation, number>>;
  return {
    cartons,
    selectedItems,
    page,
    total: groupedPage.total,
    totalPages: groupedPage.totalPages,
    summary: {
      aNumeriser: (counts.EN_ATTENTE ?? 0) + (counts.EN_COURS ?? 0) + (counts.REJETE ?? 0),
      aControler: counts.A_VALIDER ?? 0,
      termines: counts.TERMINE ?? 0,
    },
  };
}

const CONDITIONNEMENT_STATUS: Record<ProductionQueueSearch["statut"], StatutConditionnement[] | undefined> = {
  A_TRAITER: ["EN_ATTENTE", "EN_COURS", "REJETE"],
  A_CONTROLER: undefined,
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
};

export async function getConditionnementWorkspace(filters: ProductionQueueSearch, currentUserId?: number) {
  const constraints: Prisma.DossierWhereInput[] = [
    { statutNumerisation: "TERMINE" },
    ...searchConstraint(filters.q),
  ];
  const statuses = CONDITIONNEMENT_STATUS[filters.statut];
  if (statuses) constraints.push({ statutConditionnement: { in: statuses } });
  const where: Prisma.DossierWhereInput = { AND: constraints };
  const page = Math.max(1, filters.page);
  const groupedPage = await getCartonPage(where, page);
  const pageWheres = groupedPage.groups.flatMap((group) => {
    const parsed = cartonWhereFromToken(group.token);
    return parsed ? [parsed] : [];
  });
  const selectedWhere = filters.carton ? cartonWhereFromToken(filters.carton) : null;
  const [pageDossiers, selectedItems, grouped] = await Promise.all([
    pageWheres.length > 0
      ? prisma.dossier.findMany({
          where: { AND: [where, { OR: pageWheres }] },
          select: {
            id: true,
            cartonId: true,
            siteId: true,
            codeBarres: true,
            libelleCarton: true,
            statutConditionnement: true,
            conditionneurId: true,
            conditionnementClaimedAt: true,
            conditionneur: { select: { name: true } },
            site: { select: { nom: true } },
          },
        })
      : Promise.resolve([]),
    selectedWhere
      ? prisma.dossier.findMany({
          where: { statutNumerisation: "TERMINE", AND: [selectedWhere] },
          orderBy: { reference: "asc" },
          select: {
            id: true,
            cartonId: true,
            reference: true,
            nom: true,
            prenoms: true,
            statutConditionnement: true,
            conditionneurId: true,
            dateConditionnement: true,
            observationsConditionnement: true,
            conditionneur: { select: { name: true } },
            reconditionnementSessions: {
              where: { abandoned: false },
              orderBy: { startedAt: "asc" },
              select: {
                id: true, userId: true, startedAt: true, finishedAt: true, durationSeconds: true, etatRemise: true, observations: true,
                user: { select: { name: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.dossier.groupBy({
      by: ["statutConditionnement"],
      where: { statutNumerisation: "TERMINE" },
      _count: { _all: true },
    }),
  ]);
  // Dossier que l'agent a en cours, où qu'il soit : il ne peut en avoir qu'un.
  const myOpenSession = currentUserId
    ? await prisma.reconditionnementSession.findFirst({
        where: { userId: currentUserId, finishedAt: null },
        select: { startedAt: true, dossier: { select: { id: true, reference: true, cartonId: true, siteId: true, codeBarres: true, libelleCarton: true } } },
      })
    : null;
  const claimCutoff = Date.now() - 2 * 60 * 60 * 1000;
  const cartons = groupedPage.groups.map((group) => {
    const dossiers = pageDossiers.filter((dossier) => buildCartonToken(dossier) === group.token);
    return {
      ...group,
      ...getCartonDisplay(group),
      site: dossiers[0]?.site?.nom ?? "Site à confirmer",
      aConditionner: dossiers.filter((item) => item.statutConditionnement === "EN_ATTENTE" || item.statutConditionnement === "REJETE").length,
      enCours: dossiers.filter((item) => item.statutConditionnement === "EN_COURS").length,
      termines: dossiers.filter((item) => item.statutConditionnement === "TERMINE").length,
      agents: Array.from(new Set(dossiers.flatMap((item) => item.conditionneur?.name ? [item.conditionneur.name] : []))).sort(),
      activeClaimUserIds: Array.from(new Set(dossiers.flatMap((item) =>
        item.statutConditionnement === "EN_COURS" && item.conditionneurId && item.conditionnementClaimedAt && item.conditionnementClaimedAt.getTime() >= claimCutoff
          ? [item.conditionneurId]
          : [],
      ))),
    };
  });
  const counts = Object.fromEntries(grouped.map((row) => [row.statutConditionnement, row._count._all])) as Partial<Record<StatutConditionnement, number>>;
  return {
    cartons,
    selectedItems,
    myOpenSession: myOpenSession
      ? { startedAt: myOpenSession.startedAt, dossierId: myOpenSession.dossier.id, reference: myOpenSession.dossier.reference, cartonToken: buildCartonToken(myOpenSession.dossier) }
      : null,
    page,
    total: groupedPage.total,
    totalPages: groupedPage.totalPages,
    summary: {
      aConditionner: (counts.EN_ATTENTE ?? 0) + (counts.EN_COURS ?? 0) + (counts.REJETE ?? 0),
      enCours: counts.EN_COURS ?? 0,
      termines: counts.TERMINE ?? 0,
    },
  };
}

export type NumerisationCartonItem = Awaited<ReturnType<typeof getNumerisationWorkspace>>["cartons"][number];
export type NumerisationDossierItem = Awaited<ReturnType<typeof getNumerisationWorkspace>>["selectedItems"][number];
export type ConditionnementCartonItem = Awaited<ReturnType<typeof getConditionnementWorkspace>>["cartons"][number];
export type ConditionnementDossierItem = Awaited<ReturnType<typeof getConditionnementWorkspace>>["selectedItems"][number];

const REVIEW_STATUS = {
  A_TRAITER: ["EN_ATTENTE", "EN_COURS", "REJETE"],
  A_CONTROLER: ["A_VALIDER"],
  TERMINE: ["TERMINE"],
  REJETE: ["REJETE"],
  TOUS: undefined,
} as const;

async function getFinalStageWorkspace(stage: "INDEXATION" | "ARCHIVAGE", filters: ProductionQueueSearch) {
  const stageStatuses = REVIEW_STATUS[filters.statut];
  const prerequisite: Prisma.DossierWhereInput = stage === "INDEXATION"
    ? { statutConditionnement: "TERMINE" }
    : { statutIndexation: "TERMINE" };
  const statusConstraint: Prisma.DossierWhereInput = stage === "INDEXATION"
    ? { statutIndexation: stageStatuses ? { in: [...stageStatuses] as StatutIndexation[] } : undefined }
    : { statutArchivage: stageStatuses ? { in: [...stageStatuses] as StatutArchivage[] } : undefined };
  const where: Prisma.DossierWhereInput = { AND: [prerequisite, statusConstraint, ...searchConstraint(filters.q)] };
  const page = Math.max(1, filters.page);
  const groupedPage = await getCartonPage(where, page);
  const pageWheres = groupedPage.groups.flatMap((group) => {
    const parsed = cartonWhereFromToken(group.token);
    return parsed ? [parsed] : [];
  });
  const pageDossiers = pageWheres.length > 0 ? await prisma.dossier.findMany({
    where: { AND: [where, { OR: pageWheres }] },
    select: {
      id: true,
      cartonId: true,
      siteId: true,
      codeBarres: true,
      libelleCarton: true,
      statutIndexation: true,
      statutArchivage: true,
      site: { select: { nom: true } },
      _count: { select: { documents: true } },
    },
  }) : [];
  const cartons = groupedPage.groups.map((group) => {
    const dossiers = pageDossiers.filter((dossier) => buildCartonToken(dossier) === group.token);
    const statuses = dossiers.map((dossier) => stage === "INDEXATION" ? dossier.statutIndexation : dossier.statutArchivage);
    return {
      ...group,
      ...getCartonDisplay(group),
      site: dossiers[0]?.site?.nom ?? "Site à confirmer",
      aTraiter: statuses.filter((status) => status === "EN_ATTENTE" || status === "EN_COURS" || status === "REJETE").length,
      aControler: statuses.filter((status) => status === "A_VALIDER").length,
      termines: statuses.filter((status) => status === "TERMINE").length,
      documentCount: dossiers.reduce((sum, dossier) => sum + dossier._count.documents, 0),
      firstDossierId: dossiers[0]?.id ?? null,
    };
  });
  return { cartons, page, total: groupedPage.total, totalPages: groupedPage.totalPages };
}

export async function getIndexationWorkspace(filters: ProductionQueueSearch) {
  return getFinalStageWorkspace("INDEXATION", filters);
}

export async function getArchivageWorkspace(filters: ProductionQueueSearch) {
  return getFinalStageWorkspace("ARCHIVAGE", filters);
}

export type FinalStageCartonItem = Awaited<ReturnType<typeof getIndexationWorkspace>>["cartons"][number];
