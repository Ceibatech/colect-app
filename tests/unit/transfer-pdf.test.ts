import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createTransferAuthorizationPdf, createTransferMovementPdf } from "@/lib/documents/transfer-pdf";

const items = [{
  cartonCode: "B001",
  cartonLabel: "Carton foncier 001",
  dossierCount: 2,
  dossierReferences: ["DOS-2026-000001", "DOS-2026-000002"],
}];

describe("transfer PDF documents", () => {
  it("generates a readable F01 authorization PDF", async () => {
    const bytes = await createTransferAuthorizationPdf({
      reference: "TRF-20261024-MIN-CEIBA",
      lotReferences: ["LOT-2026-000001", "LOT-2026-000002"],
      authorizedAt: new Date("2026-10-23T08:00:00Z"),
      plannedAt: new Date("2026-10-24T08:00:00Z"),
      motif: "Numérisation et indexation",
      source: "Site ministère - Tour D",
      sourceAddress: "Plateau, Abidjan",
      destination: "CEIBA Analytics - Site de traitement",
      destinationAddress: "Abidjan",
      ministryContact: "Responsable du ministère",
      ceibaContact: "Responsable CEIBA",
      archiveSupport: "PHYSIQUE",
      plannedRoute: "Tour D - Plateau - Site CEIBA",
      transportMethod: "Fourgon fermé dédié",
      ceibaParticipants: "Gestionnaire de transfert et convoyeur CEIBA",
      sdaParticipants: "Responsable SDA et responsable du site de départ",
      riskAssessment: "Perte, vol, détérioration et intempéries",
      securityMeasures: "Cartons fermés, scellés numérotés et suivi GPS",
      items,
      ceibaSignatures: [{
        reference: "LOT-2026-000001",
        party: "CEIBAC_VALIDATOR",
        label: "Visa CEIBA",
        name: "Responsable CEIBA",
        title: "Responsable transfert",
        signedAt: new Date("2026-10-23T07:30:00Z"),
        data: null,
      }],
      ministrySignatures: [{
        reference: "LOT-2026-000001",
        party: "MINISTERE",
        label: "Autorité habilitée du ministère",
        name: "Responsable du ministère",
        title: "Chef de service",
        signedAt: new Date("2026-10-23T08:00:00Z"),
        data: null,
      }],
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it("generates a readable F02 movement PDF with pending signatures", async () => {
    const bytes = await createTransferMovementPdf({
      reference: "BTR-2026-0000001",
      lotReference: "LOT-2026-000001",
      type: "SORTIE",
      statusLabel: "Visa ministère requis",
      occurredAt: new Date("2026-10-23T09:00:00Z"),
      source: "Site ministère - Tour D",
      sourceAddress: "Plateau, Abidjan",
      destination: "CEIBA Analytics - Site de traitement",
      destinationAddress: "Abidjan",
      conditionLabel: null,
      observations: null,
      plannedRoute: "Tour D - Plateau - Site CEIBA",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      driverPhone: "+225 01 02 03 04 05",
      ceibaEscortName: "Convoyeur CEIBA",
      sealReferences: "SC-001, SC-002",
      sealStatusLabel: null,
      incidentReported: false,
      incidentDescription: null,
      items,
      signatures: [{
        party: "CEIBAC",
        label: "Pris en charge par CEIBA Analytics",
        name: "Gestionnaire CEIBA",
        title: "Responsable transfert",
        signedAt: new Date("2026-10-23T09:00:00Z"),
        data: null,
      }],
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it("generates a readable F03 reception report with seals and an incident", async () => {
    const bytes = await createTransferMovementPdf({
      reference: "REC-2026-0000001",
      lotReference: "LOT-2026-000001",
      type: "RECEPTION",
      statusLabel: "Visa CEIBA requis",
      occurredAt: new Date("2026-10-23T11:00:00Z"),
      source: "Site ministère - Tour D",
      sourceAddress: "Plateau, Abidjan",
      destination: "CEIBA Analytics - Site de traitement",
      destinationAddress: "Abidjan",
      conditionLabel: "Avec réserves",
      observations: "Un carton présente un coin humide.",
      plannedRoute: "Tour D - Plateau - Site CEIBA",
      vehicleRegistration: "AB-123-CD",
      vehicleDescription: "Fourgon fermé blanc",
      driverName: "Chauffeur Test",
      driverPhone: "+225 01 02 03 04 05",
      ceibaEscortName: "Convoyeur CEIBA",
      sealReferences: "SC-001, SC-002",
      sealStatusLabel: "Anomalie constatée",
      incidentReported: true,
      incidentDescription: "Le scellé SC-002 est arrivé rompu.",
      items,
      signatures: [{
        party: "CEIBAC",
        label: "Contrôle à destination par CEIBA Analytics",
        name: "Gestionnaire CEIBA",
        title: "Responsable transfert",
        signedAt: new Date("2026-10-23T11:00:00Z"),
        data: null,
      }],
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });
});
