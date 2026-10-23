import { describe, expect, it } from "vitest";
import {
  canApplyTransferStock,
  deriveTransferLotStatus,
  getTransferDossierStockSummary,
  getTransferMovementRule,
  getTransferLotStatusLabel,
  getTransferStockSummary,
  isTransferMovementChronologyValid,
} from "@/lib/utils/transfer-stock";

describe("transfer stock", () => {
  it("distinguishes CEIBA review from ministry authorization before departure", () => {
    expect(getTransferLotStatusLabel("SOUMIS")).toBe("Validation interne requise");
    expect(getTransferLotStatusLabel("VALIDE_CEIBAC")).toBe("Validation SDA requise");
    expect(deriveTransferLotStatus(["PREVU", "PREVU"], "VALIDE_CEIBAC")).toBe("VALIDE_CEIBAC");
  });
  it("keeps an arrival out of stock until the final ministry visa", () => {
    expect(canApplyTransferStock("RECEPTION", "SOUMIS_CEIBAC")).toBe(false);
    expect(canApplyTransferStock("RECEPTION", "VALIDE_CEIBAC")).toBe(false);
    expect(canApplyTransferStock("RECEPTION", "VALIDE_MINISTERE")).toBe(true);
    expect(canApplyTransferStock("SORTIE", "VALIDE_CEIBAC")).toBe(false);
    expect(canApplyTransferStock("SORTIE", "VALIDE_MINISTERE")).toBe(true);
  });
  it("keeps the exact stock split between origin, transit, CEIBA and returns", () => {
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

  it("weights the operational stock by dossiers instead of carton rows", () => {
    expect(getTransferDossierStockSummary([
      { status: "PREVU", dossierCountSnapshot: 3 },
      { status: "SORTI", dossierCountSnapshot: 2 },
      { status: "RECU", dossierCountSnapshot: 4 },
      { status: "RETOURNE", dossierCountSnapshot: 1 },
    ])).toEqual({
      total: 10,
      notDeparted: 3,
      inTransit: 2,
      atDestination: 4,
      returned: 1,
      atOrigin: 4,
      outsideOrigin: 6,
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
