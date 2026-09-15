import { describe, expect, it } from "vitest";
import { renderPasswordAccessEmail } from "@/lib/email/password-access-template";

describe("renderPasswordAccessEmail", () => {
  it("rend l'identifiant, l'action et la durée d'expiration", () => {
    const html = renderPasswordAccessEmail({
      name: "Awa Koné",
      email: "awa@ceiba-analytics.com",
      resetUrl: "https://geoarchives.ceiba-analytics.com/reinitialiser-mot-de-passe?token=abc",
      purpose: "ACTIVATE",
      expiresInMinutes: 60,
    });

    expect(html).toContain("Votre accès GeoArchives est prêt");
    expect(html).toContain("awa@ceiba-analytics.com");
    expect(html).toContain("expire dans 60 minutes");
  });

  it("échappe les valeurs dynamiques avant de produire le HTML", () => {
    const html = renderPasswordAccessEmail({
      name: '<script>alert("x")</script>',
      email: 'dangerous"@example.com',
      resetUrl: "https://example.com/reset?token=a&next=b",
      purpose: "RESET",
      expiresInMinutes: 60,
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("dangerous&quot;@example.com");
    expect(html).toContain("token=a&amp;next=b");
  });
});
