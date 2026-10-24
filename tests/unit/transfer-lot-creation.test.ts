import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), site: vi.fn(), transaction: vi.fn(),
  conflict: vi.fn(), createLot: vi.fn(), createItems: vi.fn(),
  createDossiers: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/prisma/client", () => ({ prisma: { site: { findFirst: mocks.site }, $transaction: mocks.transaction } }));
vi.mock("@/lib/utils/server-request", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/services/transfer-notification-service", () => ({ notifyTransferWorkflow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { createTransferLot } from "@/lib/services/transfer-actions";
import { buildTransferCartonToken } from "@/lib/transfers/carton-selection";

const cartons = Array.from({ length: 200 }, (_, index) => ({
  codeBarres: `CARTON-${String(index + 1).padStart(4, "0")}`, libelleCarton: null,
}));
const dossiers = cartons.flatMap((carton, index) => [0, 1].map((offset) => ({
  ...carton, id: index * 2 + offset + 1, reference: `DOS-${index * 2 + offset + 1}`, siteId: 2,
})));

function form() {
  const data = new FormData();
  Object.entries({
    sourceSiteId: "2", destinationSiteId: "3", plannedAt: "2026-11-01T08:00:00Z",
    archiveSupport: "PHYSIQUE", plannedRoute: "Ministère vers CEIBA", transportMethod: "Fourgon sécurisé",
    ceibaParticipants: "Équipe CEIBA", sdaParticipants: "Équipe SDA", riskAssessment: "Risques évalués",
    securityMeasures: "Cartons scellés", motif: "Traitement documentaire",
    cartonTokens: JSON.stringify(cartons.map(buildTransferCartonToken)),
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("creation of a full 200-carton transfer batch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ userId: 7 });
    mocks.site.mockResolvedValue({ id: 2 });
    mocks.conflict.mockResolvedValue(null);
    mocks.createLot.mockResolvedValue({ id: 42 });
    mocks.transaction.mockImplementation(async (
      callback: (tx: unknown) => Promise<unknown>,
      options: { timeout?: number },
    ) => {
      // Reproduce the production failure: stock reads alone exceed 5 seconds.
      // No wall-clock delay and no production database are used by this test.
      let elapsed = 0;
      const budget = options.timeout ?? 5_000;
      const checkBudget = () => {
        if (elapsed > budget) throw new Prisma.PrismaClientKnownRequestError("Expired transaction", {
          code: "P2028", clientVersion: "6.19.3",
        });
      };
      return callback({
        transferLot: {
          findFirst: async () => null,
          create: mocks.createLot,
          update: async () => ({}),
        },
        dossier: { findMany: async () => { elapsed = 5_200; return dossiers; } },
        transferLotDossier: {
          findFirst: async () => { checkBudget(); return mocks.conflict(); },
          createMany: mocks.createDossiers,
        },
        transferLotItem: {
          createMany: mocks.createItems,
          findMany: async () => cartons.map((carton, index) => ({ id: 1000 + index, cartonCode: carton.codeBarres })),
        },
        auditLog: { create: mocks.audit },
      });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("saves every carton and dossier after stock checks exceed the old timeout", async () => {
    const result = await createTransferLot({}, form());
    expect(result).toMatchObject({ success: true, lotId: 42 });
    expect(mocks.permission).toHaveBeenCalledWith("TRANSFER_CREATE");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "Serializable" }));
    const options = mocks.transaction.mock.calls[0][1];
    expect(options.timeout).toBeGreaterThan(5_200);
    expect(options.timeout).toBeLessThanOrEqual(60_000);
    expect(mocks.createItems.mock.calls[0][0].data).toHaveLength(200);
    expect(mocks.createDossiers.mock.calls[0][0].data).toEqual(dossiers.map((dossier) => ({
      transferLotItemId: 1000 + Math.floor((dossier.id - 1) / 2), dossierId: dossier.id,
    })));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: 7, action: "TRANSFER_LOT_CREATE",
      newValue: expect.objectContaining({ cartonCount: 200, dossierCount: 400 }),
    }) }));
  });

  it("still rejects a carton already reserved by another open transfer before writing", async () => {
    mocks.conflict.mockResolvedValue({ dossier: { reference: "DOS-1" }, transferLotItem: { transferLot: { reference: "LOT-EXISTANT" } } });
    const result = await createTransferLot({}, form());
    expect(result.error).toContain("LOT-EXISTANT");
    expect(mocks.createLot).not.toHaveBeenCalled();
    expect(mocks.createItems).not.toHaveBeenCalled();
    expect(mocks.createDossiers).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("directs users to check the register if the bounded transaction still expires", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Expired transaction", {
      code: "P2028", clientVersion: "6.19.3",
    }));
    const result = await createTransferLot({}, form());
    expect(result.error).toContain("Consultez le registre avant de réessayer");
    expect(result.success).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
