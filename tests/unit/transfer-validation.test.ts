import { describe, expect, it } from "vitest";
import { createTransferLotSchema, recordTransferMovementSchema } from "@/lib/validation/transfer";

const signature = `data:image/png;base64,${"A".repeat(120)}`;

describe("transfer validation", () => {
  it("accepts a lot with optional warehouse fields left empty", () => {
    const result = createTransferLotSchema.safeParse({
      sourceSiteId: "1",
      sourceEntrepotId: "",
      destinationSiteId: "2",
      destinationEntrepotId: "",
      includeUnlocated: "true",
      plannedAt: "2026-10-22T08:30",
      motif: "Numérisation CEIBAC",
      dossierIds: [11, 12],
    });
    expect(result.success).toBe(true);
  });

  it("requires both drawn signatures for a movement", () => {
    const base = {
      type: "SORTIE",
      itemIds: [1],
      occurredAt: "2026-10-22T08:30",
      observations: "",
      ministryName: "A. Ministère",
      ministryTitle: "Chef de service",
      ministrySignature: signature,
      ceibacName: "B. CEIBAC",
      ceibacTitle: "Responsable transfert",
      ceibacSignature: signature,
    };
    expect(recordTransferMovementSchema.safeParse(base).success).toBe(true);
    expect(recordTransferMovementSchema.safeParse({ ...base, ceibacSignature: "" }).success).toBe(false);
  });
});
