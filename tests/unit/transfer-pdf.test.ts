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
      reference: "LOT-2026-000001",
      authorizedAt: new Date("2026-10-23T08:00:00Z"),
      plannedAt: new Date("2026-10-24T08:00:00Z"),
      motif: "Numérisation et indexation",
      source: "Site ministère - Tour D",
      sourceAddress: "Plateau, Abidjan",
      destination: "CEIBA Analytics - Site de traitement",
      destinationAddress: "Abidjan",
      ministryContact: "Responsable du ministère",
      ceibaContact: "Responsable CEIBA",
      items,
      ministrySignature: {
        party: "MINISTERE",
        label: "Autorité habilitée du ministère",
        name: "Responsable du ministère",
        title: "Chef de service",
        signedAt: new Date("2026-10-23T08:00:00Z"),
        data: null,
      },
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
});
