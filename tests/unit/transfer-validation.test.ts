import { describe, expect, it } from "vitest";
import { authorizeTransferLotSchema, createTransferLotSchema, recordTransferMovementSchema } from "@/lib/validation/transfer";

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
      motif: "Numérisation CEIBA",
      dossierIds: [11, 12],
    });
    expect(result.success).toBe(true);
  });

  it("requires a planned date so the F01 can aggregate the operation", () => {
    const result = createTransferLotSchema.safeParse({
      sourceSiteId: "1",
      sourceEntrepotId: "",
      destinationSiteId: "2",
      destinationEntrepotId: "",
      includeUnlocated: "false",
      plannedAt: "",
      motif: "Transfert",
      dossierIds: [11],
    });
    expect(result.success).toBe(false);
  });

  it("requires the CEIBA signature before a movement is sent to the ministry", () => {
    const base = {
      type: "SORTIE",
      itemIds: [1],
      occurredAt: "2026-10-22T08:30",
      observations: "",
      ceibacName: "B. CEIBA",
      ceibacTitle: "Responsable transfert",
      ceibacSignature: signature,
    };
    expect(recordTransferMovementSchema.safeParse(base).success).toBe(true);
    expect(recordTransferMovementSchema.safeParse({ ...base, ceibacSignature: "" }).success).toBe(false);
  });

  it("accepts an arrival report with the CEIBA field signature only", () => {
    const result = recordTransferMovementSchema.safeParse({
      type: "RECEPTION",
      itemIds: [1],
      occurredAt: "2026-10-22T10:30",
      conditionStatus: "AVEC_RESERVES",
      observations: "Un carton présente un coin humide.",
      ceibacName: "Agent destination",
      ceibacTitle: "Convoyeur CEIBA",
      ceibacSignature: signature,
    });
    expect(result.success).toBe(true);
  });

  it("requires observations for a non-conforming arrival report", () => {
    const result = recordTransferMovementSchema.safeParse({
      type: "RECEPTION",
      itemIds: [1],
      occurredAt: "2026-10-22T10:30",
      conditionStatus: "NON_CONFORME",
      observations: "",
      ceibacName: "Agent destination",
      ceibacTitle: "Convoyeur CEIBA",
      ceibacSignature: signature,
    });
    expect(result.success).toBe(false);
  });

  it("requires a drawn signature to authorize the lot", () => {
    expect(authorizeTransferLotSchema.safeParse({ signatoryName: "A. Ministère", signatoryTitle: "Responsable transferts", signature }).success).toBe(true);
    expect(authorizeTransferLotSchema.safeParse({ signatoryName: "A. Ministère", signatoryTitle: "Responsable transferts", signature: "" }).success).toBe(false);
  });
});
