export interface StatisticsReportSnapshot {
  recipientName: string;
  scopeLabel: string;
  generatedAt: Date;
  dashboardUrl: string;
  periodLabel: string;
  includePoints: boolean;
  teamMembers: number;
  pipeline: {
    total: number;
    soumis: number;
    enControle: number;
    valides: number;
    rejetes: number;
    numerises: number;
    indexes: number;
    archives: number;
  };
  points: {
    operateurs: number;
    superviseur: number;
    total: number;
  };
  attention: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function percent(value: number, total: number): string {
  if (total <= 0) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

function metric(label: string, value: number, detail: string): string {
  return `<td width="25%" valign="top" style="padding:6px">
    <div style="min-height:82px;padding:14px;border:1px solid #d9e2ec;border-radius:6px;background:#f7fafc">
      <div style="color:#5c6b7a;font-size:11px;font-weight:700;text-transform:uppercase">${escapeHtml(label)}</div>
      <div style="margin-top:8px;color:#10243e;font-size:24px;font-weight:700">${formatNumber(value)}</div>
      <div style="margin-top:4px;color:#5c6b7a;font-size:11px">${escapeHtml(detail)}</div>
    </div>
  </td>`;
}

export function renderStatisticsReportEmail(input: StatisticsReportSnapshot): { subject: string; html: string; text: string } {
  const generated = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(input.generatedAt);
  const title = `Point GeoArchives - ${input.scopeLabel}`;
  const subject = `${title} - ${input.periodLabel}`;
  const attention = input.attention.length > 0
    ? `<ul style="margin:8px 0 0;padding-left:20px;color:#5c6b7a;font-size:14px;line-height:1.65">${input.attention.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p style="margin:8px 0 0;color:#008f7a;font-size:14px;line-height:1.6">Aucun signal prioritaire détecté.</p>`;
  const pointsSection = input.includePoints
    ? `<tr><td style="padding:8px 34px 28px">
        <h2 style="margin:0 0 10px;color:#10243e;font-size:17px">Points du mois - ${escapeHtml(input.periodLabel)}</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          ${metric("Opérateurs", input.points.operateurs, "étapes validées")}
          ${metric("Supervision", input.points.superviseur, "décisions enregistrées")}
          ${metric("Total", input.points.total, "points comptabilisés")}
          ${metric("Équipe", input.teamMembers, input.teamMembers > 1 ? "opérateurs suivis" : "opérateur suivi")}
        </tr></table>
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#10243e">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef3f8">
      <tr><td align="center" style="padding:30px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;background:#fff;border:1px solid #d9e2ec;border-radius:8px;overflow:hidden">
          <tr><td style="height:4px;background:#008f7a"></td></tr>
          <tr><td style="padding:30px 40px 16px">
            <p style="margin:0 0 12px;color:#008f7a;font-size:12px;font-weight:700;letter-spacing:1.2px">GEOARCHIVES · CEIBA ANALYTICS</p>
            <h1 style="margin:0;color:#10243e;font-size:26px;line-height:1.25">${escapeHtml(title)}</h1>
            <p style="margin:12px 0 0;color:#5c6b7a;font-size:14px;line-height:1.6">Bonjour ${escapeHtml(input.recipientName)}, voici le point consolidé généré le ${escapeHtml(generated)}.</p>
          </td></tr>
          <tr><td style="padding:6px 34px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              ${metric("Dossiers", input.pipeline.total, "dans le périmètre")}
              ${metric("Validés", input.pipeline.valides, percent(input.pipeline.valides, input.pipeline.soumis))}
              ${metric("Numérisés", input.pipeline.numerises, percent(input.pipeline.numerises, input.pipeline.valides))}
              ${metric("Archivés", input.pipeline.archives, percent(input.pipeline.archives, input.pipeline.indexes))}
            </tr></table>
          </td></tr>
          <tr><td style="padding:0 40px 22px">
            <div style="padding:16px;border:1px solid #d9e2ec;border-radius:6px">
              <h2 style="margin:0;color:#10243e;font-size:17px">Points de vigilance</h2>
              ${attention}
            </div>
          </td></tr>
          ${pointsSection}
          <tr><td align="center" style="padding:4px 40px 32px">
            <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:13px 22px;border-radius:6px;background:#2456a6;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Ouvrir le tableau de bord</a>
          </td></tr>
          <tr><td style="padding:18px 40px;border-top:1px solid #d9e2ec;color:#5c6b7a;font-size:12px;line-height:1.5;text-align:center">Rapport automatique confidentiel · CEIBA Analytics</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const lines = [
    title,
    `Généré le ${generated}`,
    "",
    `Dossiers: ${formatNumber(input.pipeline.total)}`,
    `Validés: ${formatNumber(input.pipeline.valides)}`,
    `Numérisés: ${formatNumber(input.pipeline.numerises)}`,
    `Indexés: ${formatNumber(input.pipeline.indexes)}`,
    `Archivés: ${formatNumber(input.pipeline.archives)}`,
    `Rejetés: ${formatNumber(input.pipeline.rejetes)}`,
  ];
  if (input.includePoints) {
    lines.push("", `Points ${input.periodLabel}: ${formatNumber(input.points.total)} (opérateurs ${formatNumber(input.points.operateurs)}, supervision ${formatNumber(input.points.superviseur)})`);
  }
  lines.push("", "Points de vigilance:", ...(input.attention.length ? input.attention.map((item) => `- ${item}`) : ["- Aucun signal prioritaire détecté."]), "", input.dashboardUrl);

  return { subject, html, text: lines.join("\n") };
}
