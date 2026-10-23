import { describe, expect, it } from "vitest";
import { renderTransferNotificationEmail } from "@/lib/email/transfer-notification-template";

describe("renderTransferNotificationEmail", () => {
  it("renders secure action and document links", () => {
    const message = renderTransferNotificationEmail({
      recipientName: "Responsable CEIBA",
      title: "Bordereau BTR-2026-0000001 signé",
      message: "Le visa final du ministère est enregistré.",
      reference: "BTR-2026-0000001",
      statusLabel: "Document signé disponible",
      actionUrl: "https://geoarchives.ceiba-analytics.com/transferts/1",
      actionLabel: "Consulter le transfert",
      documentUrl: "https://geoarchives.ceiba-analytics.com/api/transferts/1/bordereaux/2",
      documentLabel: "Télécharger le bordereau F02",
      details: [{ label: "Cartons", value: "12" }],
    });

    expect(message.subject).toContain("BTR-2026-0000001");
    expect(message.html).toContain("Télécharger le bordereau F02");
    expect(message.text).toContain("Cartons : 12");
  });

  it("escapes values supplied by workflow data", () => {
    const message = renderTransferNotificationEmail({
      recipientName: '<script>alert("x")</script>',
      title: "Incident <critique>",
      message: "Consulter & traiter",
      reference: 'BTR-"1"',
      statusLabel: "Incident déclaré",
      actionUrl: "https://example.com/transferts/1?a=1&b=2",
      actionLabel: "Ouvrir",
      alert: true,
    });

    expect(message.subject).toContain("Alerte transfert");
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;critique&gt;");
    expect(message.html).toContain("a=1&amp;b=2");
  });
});
