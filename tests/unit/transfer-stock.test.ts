import { describe, expect, it } from "vitest";
import {
  deriveTransferLotStatus,
  getTransferMovementRule,
  getTransferStockSummary,
  isTransferMovementChronologyValid,
} from "@/lib/utils/transfer-stock";

describe("transfer stock", () => {
  it("keeps the exact stock split between origin, transit, CEIBAC and returns", () => {
    expect(getTransferStockSummary(["PREVU", "SORTI", "RECU", "RETOURNE"])).toEqual({
      total: 4,
      notDeparted: 1,
      inTransit: 1,
      atCeibac: 1,
      returned: 1,
      atOrigin: 2,
      outsideOrigin: 2,
    });
  });

  it("derives operational lot states without losing partial movements", () => {
    expect(deriveTransferLotStatus(["PREVU", "SORTI"], "AUTORISE")).toBe("PARTIELLEMENT_SORTI");
    expect(deriveTransferLotStatus(["RECU", "SORTI"], "EN_TRANSIT")).toBe("RECU_PARTIEL");
    expect(deriveTransferLotStatus(["RECU", "RECU"], "EN_TRANSIT")).toBe("CHEZ_CEIBAC");
    expect(deriveTransferLotStatus(["RETOURNE", "RECU"], "CHEZ_CEIBAC")).toBe("RETOUR_PARTIEL");
    expect(deriveTransferLotStatus(["RETOURNE", "RETOURNE"], "RETOUR_PARTIEL")).toBe("CLOTURE");
  });

  it("defines the only permitted status transition for each movement", () => {
    expect(getTransferMovementRule("SORTIE")).toEqual({ before: "PREVU", after: "SORTI" });
    expect(getTransferMovementRule("RECEPTION")).toEqual({ before: "SORTI", after: "RECU" });
    expect(getTransferMovementRule("RETOUR")).toEqual({ before: "RECU", after: "RETOURNE" });
  });

  it("rejects a reception or return dated before the preceding custody event", () => {
    const departure = new Date("2026-10-21T09:00:00Z");
    const reception = new Date("2026-10-21T12:00:00Z");
    const item = { departedAt: departure, receivedAt: reception };
    const lotCreatedAt = new Date("2026-10-20T08:00:00Z");

    expect(isTransferMovementChronologyValid("RECEPTION", new Date("2026-10-21T08:59:00Z"), item, lotCreatedAt)).toBe(false);
    expect(isTransferMovementChronologyValid("RECEPTION", reception, item, lotCreatedAt)).toBe(true);
    expect(isTransferMovementChronologyValid("RETOUR", new Date("2026-10-21T11:59:00Z"), item, lotCreatedAt)).toBe(false);
    expect(isTransferMovementChronologyValid("RETOUR", new Date("2026-10-22T08:00:00Z"), item, lotCreatedAt)).toBe(true);
  });
});
