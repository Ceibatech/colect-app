import { describe, expect, it } from "vitest";
import {
  filterTransferCartons,
  groupAvailableTransferCartons,
} from "@/lib/transfers/carton-selection";

describe("transfer carton selection", () => {
  it("groups every dossier of one physical carton into one selectable row", () => {
    const result = groupAvailableTransferCartons([
      row(1, "CB-001", "Carton A"),
      row(2, "CB-001", "Carton A"),
      row(3, null, "Carton B", null),
    ]);

    expect(result.items).toEqual([
      expect.objectContaining({ code: "Carton B", dossierCount: 1, unlocatedDossierCount: 1 }),
      expect.objectContaining({ code: "CB-001", label: "Carton A", dossierCount: 2 }),
    ]);
  });

  it("excludes an entire carton when one of its dossiers is already in an open transfer", () => {
    const result = groupAvailableTransferCartons([
      row(1, "CB-001", "Carton A"),
      row(2, "CB-001", "Carton A", 1, true),
      row(3, "CB-002", "Carton B"),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("CB-002");
  });

  it("counts dossiers that cannot be transferred before their carton is identified", () => {
    const result = groupAvailableTransferCartons([row(1, null, null)]);
    expect(result.items).toEqual([]);
    expect(result.unidentifiedDossierCount).toBe(1);
  });

  it("searches only by carton identifiers and labels", () => {
    const items = groupAvailableTransferCartons([
      row(1, "AB-100", "Mezzanine"),
      row(2, "CD-200", "Tour D"),
    ]).items;
    expect(filterTransferCartons(items, "tour d").map((item) => item.code)).toEqual(["CD-200"]);
  });
});

function row(id: number, codeBarres: string | null, libelleCarton: string | null, siteId: number | null = 1, conflict = false) {
  return {
    id,
    siteId,
    codeBarres,
    libelleCarton,
    transferLotDossiers: conflict ? [{ id: id * 10 }] : [],
  };
}
