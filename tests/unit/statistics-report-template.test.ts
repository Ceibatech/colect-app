import { describe, expect, it } from "vitest";
import { renderStatisticsReportEmail } from "@/lib/email/statistics-report-template";

describe("renderStatisticsReportEmail", () => {
  it("escapes recipient and alert values in HTML", () => {
    const message = renderStatisticsReportEmail({
      recipientName: "Direction <script>",
      scopeLabel: "Vue globale",
      generatedAt: new Date("2026-10-23T09:00:00.000Z"),
      dashboardUrl: "https://geoarchives.ceiba-analytics.com/dashboard/direction",
      periodLabel: "Octobre 2026",
      includePoints: true,
      teamMembers: 3,
      pipeline: { total: 10, soumis: 8, enControle: 1, valides: 6, rejetes: 1, numerises: 5, indexes: 4, archives: 3 },
      points: { operateurs: 9, superviseur: 4, total: 13 },
      attention: ["1 dossier <à contrôler>"],
    });

    expect(message.subject).toContain("Vue globale");
    expect(message.html).toContain("Direction &lt;script&gt;");
    expect(message.html).toContain("1 dossier &lt;à contrôler&gt;");
    expect(message.html).not.toContain("Direction <script>");
    expect(message.text).toContain("Points Octobre 2026: 13");
  });
});
