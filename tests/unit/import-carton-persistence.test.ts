import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCartonId: vi.fn(),
  existingDossiers: vi.fn(),
  createMany: vi.fn(),
  createdDossiers: vi.fn(),
  importCreate: vi.fn(),
  importUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/prisma/client", () => ({ prisma: {
  operateur: { findMany: async () => [{ id: 1, matricule: "OP1" }] },
  commune: { findMany: async () => [{ id: 2, code: "ABJ", nom: "Abidjan" }] },
  lotissement: { findMany: async () => [{ id: 3, communeId: 2, code: "LOT1", nom: "Plateau" }] },
  natureDossier: { findMany: async () => [{ id: 4, code: "TF", libelle: "Titre foncier" }] },
  dossier: { findMany: mocks.existingDossiers },
  import: { create: mocks.importCreate, update: mocks.importUpdate },
  $transaction: mocks.transaction,
} }));

vi.mock("@/lib/cartons/persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cartons/persistence")>();
  return { ...actual, resolveCartonId: mocks.resolveCartonId };
});

import { confirmImport, type ImportRowData } from "@/lib/services/import-service";

const row: ImportRowData = {
  operateurMatricule: "OP1", codeBarres: "CT-1", libelleCarton: "Archives",
  numeroTitreFoncier: "TF-1", nom: "KOUAME", communeRef: "ABJ", lotissementRef: "LOT1", natureRef: "TF",
};

describe("import des dossiers dans leurs cartons permanents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existingDossiers.mockResolvedValue([]);
    mocks.resolveCartonId.mockResolvedValue(81);
    mocks.importCreate.mockResolvedValue({ id: 5 });
    mocks.importUpdate.mockResolvedValue({});
    mocks.createMany.mockImplementation(async ({ data }) => {
      mocks.createdDossiers.mockResolvedValue(data.map((d: { reference: string }, i: number) => ({ id: i + 1, reference: d.reference })));
      return { count: data.length };
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      dossier: { findFirst: async () => null, createMany: mocks.createMany, findMany: mocks.createdDossiers },
      dossierHistory: { createMany: async () => ({ count: 1 }) },
    }));
  });

  it("importe des dossiers distincts d'un même carton, mais ignore la copie exacte", async () => {
    const result = await confirmImport(9, "inventaire.csv", [row, { ...row, numeroTitreFoncier: "TF-2" }, { ...row }]);
    expect(result).toEqual({ importId: 5, imported: 2, skipped: 1 });
    expect(mocks.resolveCartonId).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.calls[0][0].data.map((d: { cartonId: number }) => d.cartonId)).toEqual([81, 81]);
  });

  it("ne résout qu'une fois un carton qui s'étend sur deux lots createMany", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({ ...row, numeroTitreFoncier: `TF-${index}` }));
    const result = await confirmImport(9, "inventaire.csv", rows);
    expect(result.imported).toBe(501);
    expect(mocks.createMany).toHaveBeenCalledTimes(2);
    expect(mocks.resolveCartonId).toHaveBeenCalledTimes(1);
  });

  it("conserve explicitement les dossiers sans identification de carton", async () => {
    await confirmImport(9, "inventaire.csv", [{ ...row, codeBarres: " ", libelleCarton: "" }]);
    expect(mocks.resolveCartonId).not.toHaveBeenCalled();
    expect(mocks.createMany.mock.calls[0][0].data[0].cartonId).toBeNull();
  });

  it("empêche une réimportation exacte avec des références résolues sous leur libellé", async () => {
    mocks.existingDossiers.mockResolvedValue([{
      operateurId: 1, communeId: 2, lotissementId: 3, natureDossierId: 4,
      codeBarres: row.codeBarres, libelleCarton: row.libelleCarton,
      numeroTitreFoncier: row.numeroTitreFoncier, nom: row.nom,
    }]);
    const result = await confirmImport(9, "inventaire.csv", [{ ...row, communeRef: "Abidjan", natureRef: "Titre foncier" }]);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("arrête tout le lot si le carton est engagé dans un transfert", async () => {
    mocks.resolveCartonId.mockRejectedValue(new Error("Ce carton est engagé dans un transfert ouvert."));
    await expect(confirmImport(9, "inventaire.csv", [row])).rejects.toThrow("transfert ouvert");
    expect(mocks.createMany).not.toHaveBeenCalled();
    expect(mocks.importUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ statut: "ECHEC", nombreImportes: 0 }) }));
  });
});
