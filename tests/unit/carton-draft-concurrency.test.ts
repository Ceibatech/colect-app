import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DossierFormValues } from "@/lib/validation/dossier";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), operateur: vi.fn(), findDraft: vi.fn(), transaction: vi.fn(),
  resolveCartonId: vi.fn(), updateMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/prisma/client", () => ({ prisma: {
  operateur: { findUnique: mocks.operateur },
  dossier: { findUnique: mocks.findDraft },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/cartons/persistence", () => ({ resolveCartonId: mocks.resolveCartonId }));
vi.mock("@/lib/utils/server-request", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/cartons/cote-assignment", () => ({ assignDossierCote: async () => null, findCartonByCote: async () => null }));

import { saveDraft } from "@/lib/services/dossier-service";

type MemoryDossier = {
  id: number; reference: string; operateurId: number; cartonId: number | null;
  siteId: number | null; entrepotId: number | null; updatedAt: Date;
  statutCollecte: string; codeBarres: string; libelleCarton: string | null; nom: string;
};

let stored: MemoryDossier;
const values: DossierFormValues = { operateurId: 7, siteId: 2, entrepotId: 3, codeBarres: "BOITE-A", nom: "Correction" };
const tx = { dossier: { updateMany: mocks.updateMany } };

beforeEach(() => {
  vi.resetAllMocks();
  stored = {
    id: 10, reference: "DOS-2026-000010", operateurId: 7, cartonId: 11,
    siteId: 2, entrepotId: 3, updatedAt: new Date("2026-10-25T08:00:00.000Z"),
    statutCollecte: "BROUILLON", codeBarres: "BOITE-A", libelleCarton: null, nom: "Initial",
  };
  mocks.permission.mockResolvedValue({ roleCode: "ADMIN", userId: 1 });
  mocks.operateur.mockResolvedValue({ id: 7, isActive: true });
  // The first read is a snapshot, as it is when Prisma materializes a row.
  mocks.findDraft.mockImplementation(async () => ({ ...stored }));
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  mocks.resolveCartonId.mockResolvedValue(11);
  // Model an atomic conditional SQL UPDATE. Omitting a guard in the service
  // would actually overwrite the changed location/identity in these tests.
  mocks.updateMany.mockImplementation(async ({ where, data }: {
    where: Record<string, unknown>; data: Partial<MemoryDossier>;
  }) => {
    const matches = Object.entries(where).every(([key, expected]) => {
      const actual = stored[key as keyof MemoryDossier];
      return expected instanceof Date && actual instanceof Date
        ? expected.getTime() === actual.getTime()
        : actual === expected;
    });
    if (!matches) return { count: 0 };
    Object.assign(stored, data);
    return { count: 1 };
  });
});

describe("carton draft concurrency", () => {
  it("saves a current draft while preserving its physical carton ID", async () => {
    await expect(saveDraft(values, 10)).resolves.toMatchObject({ id: 10, reference: "DOS-2026-000010" });
    expect(stored).toMatchObject({ cartonId: 11, siteId: 2, entrepotId: 3, nom: "Correction" });
  });

  it.each([
    { siteId: null, entrepotId: null }, // Departure into transit.
    { siteId: 9, entrepotId: 6 }, // Receipt at the destination.
    { siteId: 2, entrepotId: null }, // Room changed at the same site.
  ])("does not restore the old location after a movement commits during the carton lock wait: %j", async (newLocation) => {
    mocks.resolveCartonId.mockImplementation(async () => {
      // Deliberately retain updatedAt: location guards must still protect two
      // commits sharing the database's millisecond timestamp resolution.
      Object.assign(stored, newLocation);
      return 11;
    });
    await expect(saveDraft(values, 10)).rejects.toThrow("modifié ou déplacé");
    expect(stored).toMatchObject({ ...newLocation, cartonId: 11, nom: "Initial" });
  });

  it("rejects another edit even if it did not move the carton", async () => {
    mocks.resolveCartonId.mockImplementation(async () => {
      stored.updatedAt = new Date("2026-10-25T08:00:01.000Z");
      stored.nom = "Autre agent";
      return 11;
    });
    await expect(saveDraft(values, 10)).rejects.toThrow("modifié ou déplacé");
    expect(stored.nom).toBe("Autre agent");
  });

  it("cannot undo a concurrent carton assignment", async () => {
    mocks.resolveCartonId.mockImplementation(async () => {
      stored.cartonId = 12;
      return 11;
    });
    await expect(saveDraft(values, 10)).rejects.toThrow("modifié ou déplacé");
    expect(stored.cartonId).toBe(12);
  });

  it("cannot edit a draft submitted during the lock wait", async () => {
    mocks.resolveCartonId.mockImplementation(async () => {
      stored.statutCollecte = "SOUMIS";
      return 11;
    });
    await expect(saveDraft(values, 10)).rejects.toThrow("modifié ou déplacé");
    expect(stored).toMatchObject({ statutCollecte: "SOUMIS", nom: "Initial" });
  });
});
