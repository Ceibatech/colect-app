import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dossierFindMany: vi.fn(), dossierCount: vi.fn(), dossierGroupBy: vi.fn(),
  documentFindMany: vi.fn(), documentCount: vi.fn(), queryRaw: vi.fn(),
  requirePermission: vi.fn(), getOperateurScopeFilter: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({ prisma: {
  dossier: { findMany: mocks.dossierFindMany, count: mocks.dossierCount, groupBy: mocks.dossierGroupBy },
  document: { findMany: mocks.documentFindMany, count: mocks.documentCount },
  carton: { findMany: async () => [] },
  $queryRaw: mocks.queryRaw,
} }));
vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/services/access-scope", () => ({ getOperateurScopeFilter: mocks.getOperateurScopeFilter }));

import { getPreparationWorkspace } from "@/lib/services/preparation-service";
import { getArchivageWorkspace, getConditionnementWorkspace, getIndexationWorkspace, getNumerisationWorkspace } from "@/lib/services/production-queue-service";
import { searchDossiers } from "@/lib/services/dossier-query-service";
import { searchIndexedDocuments } from "@/lib/services/document-search-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dossierCount.mockResolvedValue(0);
  mocks.documentCount.mockResolvedValue(0);
  mocks.documentFindMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.requirePermission.mockResolvedValue({ roleCode: "OPERATEUR", userId: 7 });
  mocks.getOperateurScopeFilter.mockResolvedValue(17);
  mocks.dossierGroupBy.mockImplementation(async ({ by }: { by: string[] }) => by.includes("cartonId") ? [
    { cartonId: 10, siteId: 1, codeBarres: "CODE-COMMUN", libelleCarton: "A", _count: { _all: 2 } },
    { cartonId: 11, siteId: 1, codeBarres: "CODE-COMMUN", libelleCarton: "A", _count: { _all: 1 } },
    { cartonId: 10, siteId: 2, codeBarres: "CODE-APRES-MOUVEMENT", libelleCarton: "B", _count: { _all: 1 } },
  ] : []);
  mocks.dossierFindMany.mockResolvedValue([10, 11].map((cartonId) => ({
    id: cartonId, cartonId, siteId: 1, codeBarres: "CODE-COMMUN", libelleCarton: "A",
    statutPreparation: "EN_ATTENTE", statutNumerisation: "EN_ATTENTE", statutConditionnement: "EN_ATTENTE",
    statutIndexation: "EN_ATTENTE", statutArchivage: "EN_ATTENTE",
    documents: [], _count: { documents: 0 }, site: { nom: "Plateau" },
  })));
});

describe("files de traitement par carton physique", () => {
  const workspaces = [
    ["préparation", getPreparationWorkspace], ["numérisation", getNumerisationWorkspace],
    ["reconditionnement", getConditionnementWorkspace], ["indexation", getIndexationWorkspace],
    ["archivage", getArchivageWorkspace],
  ] as const;

  it.each(workspaces)("%s sépare deux IDs de même code et garde le même carton après déplacement", async (_name, workspace) => {
    const result = await workspace({ page: 1, statut: "TOUS" });
    expect(result.cartons.map((carton) => ({ token: carton.token, label: carton.label, count: carton.totalDossiers }))).toEqual([
      { token: "carton:10", label: "CTN-00000010", count: 3 },
      { token: "carton:11", label: "CTN-00000011", count: 1 },
    ]);
    expect(mocks.dossierFindMany.mock.calls[0][0].select.cartonId).toBe(true);
  });

  it.each(workspaces)("%s accepte une recherche par référence CTN", async (_name, workspace) => {
    mocks.dossierGroupBy.mockResolvedValue([]);
    await workspace({ page: 1, statut: "TOUS", q: "CTN-00000010" });
    expect(mocks.dossierGroupBy.mock.calls[0][0].where.AND).toContainEqual({ cartonId: 10 });
  });

  it("ouvre un carton sélectionné indépendamment de son ancien emplacement", async () => {
    await getPreparationWorkspace({ page: 1, statut: "TOUS", carton: "carton:10" });
    const selectedQuery = mocks.dossierFindMany.mock.calls[0][0];
    expect(selectedQuery.where).toEqual({ statutValidation: "VALIDE", AND: [{ cartonId: 10 }] });
  });
});

describe("recherche d'un carton et périmètre utilisateur", () => {
  it("recherche tous les dossiers du carton dans le périmètre opérateur existant", async () => {
    await searchDossiers({ q: "CTN-00000010", operateurId: { in: [17, 18] } }, { page: 1, pageSize: 20, sort: "createdAt", dir: "desc" });
    const where = mocks.dossierFindMany.mock.calls[0][0].where;
    expect(where.operateurId).toEqual({ in: [17, 18] });
    expect(where.OR).toEqual([{ cartonId: 10 }]);
    expect(mocks.dossierCount.mock.calls[0][0].where).toEqual(where);
  });

  it("reserves a CTN query for its physical carton even if another carton has the same text as an old barcode", async () => {
    const rows = [
      { id: 1, cartonId: 10, codeBarres: "ANCIEN-A" },
      { id: 2, cartonId: 11, codeBarres: "CTN-00000010" },
    ];
    mocks.dossierFindMany.mockImplementation(async ({ where }: {
      where: { OR: Array<{ cartonId?: number; codeBarres?: { contains: string } }> };
    }) => rows.filter((row) => where.OR.some((clause) =>
      clause.cartonId !== undefined ? clause.cartonId === row.cartonId
        : clause.codeBarres !== undefined && row.codeBarres.includes(clause.codeBarres.contains),
    )));
    const result = await searchDossiers({ q: "CTN-00000010" }, { page: 1, pageSize: 20, sort: "createdAt", dir: "desc" });
    expect(result.items.map((row) => row.id)).toEqual([1]);
  });

  it("retrouve les documents d'un carton sans exiger que son ID figure dans l'OCR", async () => {
    await searchIndexedDocuments({ query: "CTN-00000010" });
    expect(mocks.requirePermission).toHaveBeenCalledWith("DOSSIER_READ");
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.documentFindMany.mock.calls[0][0].where).toMatchObject({
      dossier: { operateurId: 17 }, AND: [{ dossier: { cartonId: 10 } }],
      automaticIndexStatus: "INDEXE", preIndexStatus: "PRET",
    });
  });
});
