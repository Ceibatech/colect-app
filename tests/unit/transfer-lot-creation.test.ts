import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), site: vi.fn(), entrepot: vi.fn(), transaction: vi.fn(),
  conflict: vi.fn(), createLot: vi.fn(), createItems: vi.fn(),
  createDossiers: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
  findDossiers: vi.fn(), lockCartons: vi.fn(), reservedCarton: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ requirePermission: mocks.permission }));
vi.mock("@/lib/prisma/client", () => ({ prisma: { site: { findFirst: mocks.site }, entrepot: { findFirst: mocks.entrepot }, $transaction: mocks.transaction } }));
vi.mock("@/lib/utils/server-request", () => ({ getClientIp: async () => "192.0.2.1" }));
vi.mock("@/lib/services/transfer-notification-service", () => ({ notifyTransferWorkflow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { createTransferLot } from "@/lib/services/transfer-actions";
import { buildTransferCartonToken } from "@/lib/transfers/carton-selection";

const cartons = Array.from({ length: 200 }, (_, index) => ({
  cartonId: index + 1,
  codeBarres: `CARTON-${String(index + 1).padStart(4, "0")}`, libelleCarton: null,
}));
const dossiers = cartons.flatMap((carton, index) => [0, 1].map((offset) => ({
  ...carton, id: index * 2 + offset + 1, reference: `DOS-${index * 2 + offset + 1}`, siteId: 2, entrepotId: null,
})));

function form(tokens: Array<string | null> = cartons.map(buildTransferCartonToken)) {
  const data = new FormData();
  Object.entries({
    sourceSiteId: "2", destinationSiteId: "3", plannedAt: "2026-11-01T08:00:00Z",
    archiveSupport: "PHYSIQUE", plannedRoute: "Ministère vers CEIBA", transportMethod: "Fourgon sécurisé",
    ceibaParticipants: "Équipe CEIBA", sdaParticipants: "Équipe SDA", riskAssessment: "Risques évalués",
    securityMeasures: "Cartons scellés", motif: "Traitement documentaire",
    cartonTokens: JSON.stringify(tokens),
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("creation of a full 200-carton transfer batch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ userId: 7 });
    mocks.site.mockResolvedValue({ id: 2 });
    mocks.entrepot.mockResolvedValue({ id: 7 });
    mocks.conflict.mockResolvedValue(null);
    mocks.reservedCarton.mockResolvedValue(null);
    mocks.findDossiers.mockResolvedValue(dossiers);
    mocks.lockCartons.mockResolvedValue(cartons.map((carton) => ({ id: carton.cartonId })));
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
        $queryRaw: mocks.lockCartons,
        transferLot: {
          findFirst: async () => null,
          create: mocks.createLot,
          update: async () => ({}),
        },
        dossier: { findMany: async (query: unknown) => { elapsed = 5_200; return mocks.findDossiers(query); } },
        transferLotDossier: {
          findFirst: async () => { checkBudget(); return mocks.conflict(); },
          createMany: mocks.createDossiers,
        },
        transferLotItem: {
          findFirst: mocks.reservedCarton,
          createMany: mocks.createItems,
          findMany: async () => (mocks.createItems.mock.calls[0][0].data as Array<{ cartonId: number }>)
            .map((carton, index) => ({ id: 1000 + index, cartonId: carton.cartonId })).reverse(),
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
    expect(mocks.createItems.mock.calls[0][0].data[0]).toMatchObject({ cartonId: 1, cartonCode: "CTN-00000001" });
    expect(mocks.createDossiers.mock.calls[0][0].data).toEqual(dossiers.map((dossier) => ({
      transferLotItemId: 1000 + Math.floor((dossier.id - 1) / 2), dossierId: dossier.id,
    })));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: 7, action: "TRANSFER_LOT_CREATE",
      newValue: expect.objectContaining({ cartonCount: 200, dossierCount: 400 }),
    }) }));
  });

  it("accepts two physical cartons with the same legacy barcode and captures their separate manifests", async () => {
    mocks.findDossiers.mockResolvedValue([
      { ...dossiers[0], cartonId: 1, codeBarres: "MEME-CODE", libelleCarton: "A" },
      { ...dossiers[2], cartonId: 2, codeBarres: "MEME-CODE", libelleCarton: "A" },
    ]);
    const result = await createTransferLot({}, form(["carton:1", "carton:2"]));
    expect(result.success).toBe(true);
    expect(mocks.createItems.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ cartonId: 1, cartonCode: "CTN-00000001", dossierCountSnapshot: 1 }),
      expect.objectContaining({ cartonId: 2, cartonCode: "CTN-00000002", dossierCountSnapshot: 1 }),
    ]);
    expect(mocks.createDossiers.mock.calls[0][0].data).toEqual([
      { transferLotItemId: 1000, dossierId: 1 }, { transferLotItemId: 1001, dossierId: 3 },
    ]);
  });

  it.each([
    { siteId: 99, entrepotId: null },
    { siteId: null, entrepotId: null },
    { siteId: 2, entrepotId: 7 },
  ])("rejects the complete carton when a member is outside the source location: %j", async (otherLocation) => {
    mocks.findDossiers.mockResolvedValue([dossiers[0], { ...dossiers[1], ...otherLocation }]);
    const result = await createTransferLot({}, form(["carton:1"]));
    expect(result.error).toContain("plusieurs emplacements");
    expect(mocks.findDossiers.mock.calls[0][0].where).toEqual({ OR: [{ cartonId: 1 }] });
    expect(mocks.createLot).not.toHaveBeenCalled();
    expect(mocks.createDossiers).not.toHaveBeenCalled();
  });

  it("does not hide a NULL room when checking a carton selected in a named room", async () => {
    mocks.findDossiers.mockResolvedValue([{ ...dossiers[0], entrepotId: 7 }, dossiers[1]]);
    const data = form(["carton:1"]);
    data.set("sourceEntrepotId", "7");
    const result = await createTransferLot({}, data);
    expect(result.error).toContain("plusieurs emplacements");
    expect(mocks.createLot).not.toHaveBeenCalled();
  });

  it("rejects an already reserved physical carton even if none of its current members has a historical transfer link", async () => {
    mocks.reservedCarton.mockResolvedValue({ transferLot: { reference: "LOT-RESERVE" } });
    const result = await createTransferLot({}, form());
    expect(result.error).toContain("LOT-RESERVE");
    expect(mocks.conflict).not.toHaveBeenCalled();
    expect(mocks.createLot).not.toHaveBeenCalled();
    expect(mocks.createItems).not.toHaveBeenCalled();
  });

  it("requires refreshing an old selection instead of resolving a reused barcode to a different carton", async () => {
    const result = await createTransferLot({}, form(["site:2|code:CARTON-0001"]));
    expect(result.error).toContain("Actualisez la proposition");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createLot).not.toHaveBeenCalled();
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
