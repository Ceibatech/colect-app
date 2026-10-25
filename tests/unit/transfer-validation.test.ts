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
      archiveSupport: "PHYSIQUE",
      plannedRoute: "Tour D vers site CEIBA",
      transportMethod: "VEHICULE_CEIBA",
      ceibaParticipantIds: ["4"],
      sdaParticipantIds: ["9"],
      risks: ["PERTE", "VOL"],
      securityMeasures: ["SCELLES"],
      motif: "Numérisation CEIBA",
      cartonTokens: ["site:any|code:CARTON-001", "site:any|code:CARTON-002"],
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
      archiveSupport: "PHYSIQUE",
      plannedRoute: "Tour D vers site CEIBA",
      transportMethod: "Véhicule fermé dédié",
      ceibaParticipants: "Responsable CEIBA",
      sdaParticipants: "Responsable SDA",
      riskAssessment: "Perte et vol",
      securityMeasures: "Scellés et suivi",
      motif: "Transfert",
      cartonTokens: ["site:any|code:CARTON-001"],
    });
    expect(result.success).toBe(false);
  });

  it("limits one transfer operation to 200 cartons", () => {
    const result = createTransferLotSchema.safeParse({
      sourceSiteId: "1",
      sourceEntrepotId: "",
      destinationSiteId: "2",
      destinationEntrepotId: "",
      includeUnlocated: "false",
      plannedAt: "2026-10-22T08:30",
      archiveSupport: "PHYSIQUE",
      plannedRoute: "Tour D vers site CEIBA",
      transportMethod: "Véhicule fermé dédié",
      ceibaParticipants: "Responsable CEIBA",
      sdaParticipants: "Responsable SDA",
      riskAssessment: "Perte et vol",
      securityMeasures: "Scellés et suivi",
      motif: "Transfert",
      cartonTokens: Array.from({ length: 201 }, (_, index) => `site:any|code:CARTON-${index}`),
    });
    expect(result.success).toBe(false);
  });

  it("requires the CEIBA signature before a movement is sent to the ministry", () => {
    const base = {
      type: "SORTIE",
      itemIds: [1],
      occurredAt: "2026-10-22T08:30",
      observations: "",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      ceibaEscortName: "Convoyeur CEIBA",
      incidentReported: "false",
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
      sealStatus: "INTACTS",
      observations: "Un carton présente un coin humide.",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      ceibaEscortName: "Convoyeur CEIBA",
      incidentReported: "false",
      ceibacName: "Agent destination",
      ceibacTitle: "Convoyeur CEIBA",
      ceibacSignature: signature,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a physical departure without secured transport details", () => {
    const result = recordTransferMovementSchema.safeParse({
      type: "SORTIE",
      itemIds: [1],
      occurredAt: "2026-10-22T08:30",
      incidentReported: "false",
      ceibacName: "B. CEIBA",
      ceibacTitle: "Responsable transfert",
      ceibacSignature: signature,
    });
    expect(result.success).toBe(false);
  });

  it("requires a written incident report when a seal anomaly is found", () => {
    const result = recordTransferMovementSchema.safeParse({
      type: "RECEPTION",
      itemIds: [1],
      occurredAt: "2026-10-22T10:30",
      conditionStatus: "AVEC_RESERVES",
      sealStatus: "ANOMALIE",
      observations: "Le scelle ne correspond pas au bordereau.",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      ceibaEscortName: "Convoyeur CEIBA",
      incidentReported: "true",
      incidentDescription: "",
      ceibacName: "Agent destination",
      ceibacTitle: "Convoyeur CEIBA",
      ceibacSignature: signature,
    });
    expect(result.success).toBe(false);
  });

  it("requires observations for a non-conforming arrival report", () => {
    const result = recordTransferMovementSchema.safeParse({
      type: "RECEPTION",
      itemIds: [1],
      occurredAt: "2026-10-22T10:30",
      conditionStatus: "NON_CONFORME",
      sealStatus: "ANOMALIE",
      observations: "",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      ceibaEscortName: "Convoyeur CEIBA",
      incidentReported: "true",
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
