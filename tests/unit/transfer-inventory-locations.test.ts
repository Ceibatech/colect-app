import { describe, expect, it, vi, beforeEach } from "vitest";
import { summarizeInventoryLocations } from "@/lib/transfers/inventory-locations";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma/client", () => ({ prisma: { dossier: { findMany: mocks.findMany } } }));
vi.mock("@/lib/auth/current-user", () => ({ requirePermission: vi.fn() }));
import { searchTransferCartons } from "@/lib/services/transfer-service";

describe("inventory locations", () => {
  it("counts physical IDs by their current location and merges varied descriptions of one carton", () => {
    const base = { cartonId: 1, siteId: 4, entrepotId: 7, codeBarres: "CB-1", libelleCarton: "Boîte A", _count: { _all: 3 } };
    expect(summarizeInventoryLocations([
      base, { ...base, libelleCarton: "Ancien libellé", _count: { _all: 2 } },
      { ...base, cartonId: 2, entrepotId: 8 }, { ...base, cartonId: 3, siteId: 2 },
    ])).toEqual([
      { siteId: 4, entrepotId: 7, dossiers: 5, cartons: 1, unidentifiedDossiers: 0 },
      { siteId: 4, entrepotId: 8, dossiers: 3, cartons: 1, unidentifiedDossiers: 0 },
      { siteId: 2, entrepotId: 7, dossiers: 3, cartons: 1, unidentifiedDossiers: 0 },
    ]);
  });
  it("counts separate physical cartons even when their room and legacy barcode coincide", () => {
    const base = { siteId: 4, entrepotId: 7, codeBarres: "CB-1", libelleCarton: "Boîte A", _count: { _all: 3 } };
    expect(summarizeInventoryLocations([{ ...base, cartonId: 1 }, { ...base, cartonId: 2 }]))
      .toEqual([{ siteId: 4, entrepotId: 7, dossiers: 6, cartons: 2, unidentifiedDossiers: 0 }]);
  });
  it("counts labels without a barcode and keeps unidentified dossiers visible in the inventory", () => {
    expect(summarizeInventoryLocations([
      { siteId: null, entrepotId: null, codeBarres: "", libelleCarton: "Carton 1", _count: { _all: 4 } },
      { siteId: null, entrepotId: null, codeBarres: null, libelleCarton: null, _count: { _all: 2 } },
    ])).toEqual([{ siteId: null, entrepotId: null, dossiers: 6, cartons: 1, unidentifiedDossiers: 2 }]);
  });
});

describe("transfer stock is independent of production stages", () => {
  beforeEach(() => mocks.findMany.mockReset());
  it("queries the current room without any workflow gate and explains unavailable cartons", async () => {
    mocks.findMany.mockResolvedValue([
      { id: 1, cartonId: 1, siteId: 4, codeBarres: "A", libelleCarton: null, transferLotDossiers: [] },
      { id: 2, cartonId: 2, siteId: 4, codeBarres: "B", libelleCarton: null, transferLotDossiers: [{ id: 8 }] },
      { id: 3, cartonId: null, siteId: 4, codeBarres: null, libelleCarton: null, transferLotDossiers: [] },
    ]);
    const result = await searchTransferCartons({ sourceSiteId: 4, sourceEntrepotId: 7, page: 1 });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ siteId: 4, entrepotId: 7 });
    expect(mocks.findMany.mock.calls[0][0].select.cartonId).toBe(true);
    expect(result).toMatchObject({ total: 1, totalDossiers: 1, engagedCartonCount: 1, unidentifiedDossierCount: 1 });
  });
  it("does not interpret no-room as every room of the site", async () => {
    mocks.findMany.mockResolvedValue([]);
    await searchTransferCartons({ sourceSiteId: 4, sourceEntrepotId: null, page: 1 });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ siteId: 4, entrepotId: null });
  });
});
