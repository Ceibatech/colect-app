import { describe, expect, it } from "vitest";
import { getTransferAuthorizationGroupDownloadHref, groupTransferAuthorizationRows } from "@/lib/transfers/authorization-groups";

const base = {
  status: "AUTORISE",
  plannedAt: new Date("2026-10-31T08:00:00Z"),
  createdAt: new Date("2026-10-23T08:00:00Z"),
  authorizedAt: new Date("2026-10-24T08:00:00Z"),
  sourceSiteId: 2,
  sourceEntrepotId: 7,
  destinationSiteId: 4,
  destinationEntrepotId: 9,
  source: "Tour D",
  destination: "Site CEIBA",
  cartonCount: 2,
  dossierCount: 15,
};

describe("transfer authorization groups", () => {
  it("creates one F01 operation for lots on the same date and itinerary", () => {
    const groups = groupTransferAuthorizationRows([
      { ...base, id: 1, reference: "LOT-2026-000001" },
      { ...base, id: 2, reference: "LOT-2026-000002", cartonCount: 3, dossierCount: 20 },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ lotCount: 2, cartonCount: 5, dossierCount: 35, fullyAuthorized: true });
    expect(groups[0].references).toEqual(["LOT-2026-000001", "LOT-2026-000002"]);
    expect(getTransferAuthorizationGroupDownloadHref(groups[0])).toContain("/api/transferts/autorisations?date=2026-10-31");
  });

  it("does not publish the final F01 until every lot in the operation is authorized", () => {
    const groups = groupTransferAuthorizationRows([
      { ...base, id: 1, reference: "LOT-2026-000001" },
      { ...base, id: 2, reference: "LOT-2026-000002", authorizedAt: null },
    ]);
    expect(groups[0].fullyAuthorized).toBe(false);
  });

  it("keeps different dates or itineraries in separate operations", () => {
    const groups = groupTransferAuthorizationRows([
      { ...base, id: 1, reference: "LOT-1" },
      { ...base, id: 2, reference: "LOT-2", plannedAt: new Date("2026-11-01T08:00:00Z") },
      { ...base, id: 3, reference: "LOT-3", destinationSiteId: 5 },
    ]);
    expect(groups).toHaveLength(3);
  });
});
