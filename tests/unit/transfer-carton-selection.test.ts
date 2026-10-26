import { describe, expect, it } from "vitest";
import {
  filterTransferCartons,
  groupAvailableTransferCartons,
} from "@/lib/transfers/carton-selection";

describe("transfer carton selection", () => {
  it("an exact permanent reference cannot match another carton's old label", () => {
    const items = groupAvailableTransferCartons([
      row(1, 10, "OLD", null),
      row(2, 11, "CTN-00000010", null),
    ]).items;
    expect(filterTransferCartons(items, "ctn-00000010").map((item) => item.token)).toEqual(["carton:10"]);
  });
  it("groups every dossier of one physical carton into one selectable row", () => {
    const result = groupAvailableTransferCartons([
      row(1, 1, "CB-001", "Carton A"),
      row(2, 1, "CB-001", "Carton A"),
      row(3, 2, null, "Carton B", null),
    ]);

    expect(result.items).toEqual([
      expect.objectContaining({ token: "carton:1", code: "CTN-00000001", label: "Carton A", dossierCount: 2 }),
      expect.objectContaining({ token: "carton:2", code: "CTN-00000002", dossierCount: 1, unlocatedDossierCount: 1 }),
    ]);
  });

  it("excludes an entire carton when one of its dossiers is already in an open transfer", () => {
    const result = groupAvailableTransferCartons([
      row(1, 1, "CB-001", "Carton A"),
      row(2, 1, "CB-001", "Carton A", 1, true),
      row(3, 2, "CB-002", "Carton B"),
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("CTN-00000002");
  });

  it("counts dossiers that cannot be transferred before their carton is identified", () => {
    const result = groupAvailableTransferCartons([row(1, null, null, null)]);
    expect(result.items).toEqual([]);
    expect(result.unidentifiedDossierCount).toBe(1);
  });

  it("searches by the stable reference and the old identifiers or labels", () => {
    const items = groupAvailableTransferCartons([
      row(1, 1, "AB-100", "Mezzanine"),
      row(2, 2, "CD-200", "Tour D"),
    ]).items;
    expect(filterTransferCartons(items, "tour d").map((item) => item.code)).toEqual(["CTN-00000002"]);
    expect(filterTransferCartons(items, "cd-200").map((item) => item.code)).toEqual(["CTN-00000002"]);
    expect(filterTransferCartons(items, "ctn-00000002").map((item) => item.code)).toEqual(["CTN-00000002"]);
  });

  it("keeps distinct IDs separate despite matching codes and groups changed labels under the same ID", () => {
    const items = groupAvailableTransferCartons([
      row(1, 1, "CB-001", "Ancien libellé"),
      row(2, 2, "CB-001", "Ancien libellé"),
      row(3, 1, "NOUVEAU-CODE", "Étiquette corrigée"),
    ]).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ token: "carton:1", dossierCount: 2 });
    expect(items[1]).toMatchObject({ token: "carton:2", dossierCount: 1 });
    expect(filterTransferCartons(items, "etiquette corrigee").map((item) => item.token)).toEqual(["carton:1"]);
    expect(filterTransferCartons(items, "nouveau-code").map((item) => item.token)).toEqual(["carton:1"]);
    expect(filterTransferCartons(items, "CB-001")).toHaveLength(2);
  });
});

function row(id: number, cartonId: number | null, codeBarres: string | null, libelleCarton: string | null, siteId: number | null = 1, conflict = false) {
  return {
    id,
    cartonId,
    siteId,
    codeBarres,
    libelleCarton,
    transferLotDossiers: conflict ? [{ id: id * 10 }] : [],
  };
}
