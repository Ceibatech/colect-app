export interface TransferNotificationEmailInput {
  recipientName: string;
  title: string;
  message: string;
  reference: string;
  statusLabel: string;
  actionUrl: string;
  actionLabel: string;
  documentUrl?: string;
  documentLabel?: string;
  details?: Array<{ label: string; value: string }>;
  alert?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderTransferNotificationEmail(input: TransferNotificationEmailInput): { subject: string; html: string; text: string } {
  const subject = `${input.alert ? "Alerte transfert" : "GeoArchives"} - ${input.title}`;
  const accent = input.alert ? "#c2410c" : "#008f7a";
  const details = input.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse">${input.details.map((detail) => `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #e7edf3;color:#5c6b7a;font-size:13px">${escapeHtml(detail.label)}</td>
        <td align="right" style="padding:9px 12px;border-bottom:1px solid #e7edf3;color:#10243e;font-size:13px;font-weight:700">${escapeHtml(detail.value)}</td>
      </tr>`).join("")}</table>`
    : "";
  const documentLink = input.documentUrl
    ? `<a href="${escapeHtml(input.documentUrl)}" style="display:inline-block;margin:8px 6px;padding:12px 18px;border:1px solid #2456a6;border-radius:6px;color:#2456a6;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(input.documentLabel ?? "Télécharger le bordereau")}</a>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#10243e">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef3f8">
      <tr><td align="center" style="padding:30px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;background:#fff;border:1px solid #d9e2ec;border-radius:8px;overflow:hidden">
          <tr><td style="height:4px;background:${accent}"></td></tr>
          <tr><td style="padding:30px 40px 14px">
            <p style="margin:0 0 12px;color:${accent};font-size:12px;font-weight:700;letter-spacing:1.2px">GEOARCHIVES · CEIBA ANALYTICS</p>
            <h1 style="margin:0;color:#10243e;font-size:25px;line-height:1.3">${escapeHtml(input.title)}</h1>
            <p style="margin:14px 0 0;color:#5c6b7a;font-size:15px;line-height:1.65">Bonjour ${escapeHtml(input.recipientName)},</p>
            <p style="margin:8px 0 0;color:#5c6b7a;font-size:15px;line-height:1.65">${escapeHtml(input.message)}</p>
          </td></tr>
          <tr><td style="padding:6px 40px 24px">
            <div style="padding:16px;border:1px solid #d9e2ec;border-radius:6px;background:#f7fafc">
              <div style="color:#5c6b7a;font-size:11px;font-weight:700;text-transform:uppercase">Référence</div>
              <div style="margin-top:5px;color:#10243e;font-size:19px;font-weight:700">${escapeHtml(input.reference)}</div>
              <div style="margin-top:9px;color:${accent};font-size:13px;font-weight:700">${escapeHtml(input.statusLabel)}</div>
              ${details}
            </div>
          </td></tr>
          <tr><td align="center" style="padding:0 40px 32px">
            <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;margin:8px 6px;padding:13px 20px;border-radius:6px;background:#2456a6;color:#fff;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(input.actionLabel)}</a>
            ${documentLink}
          </td></tr>
          <tr><td style="padding:18px 40px;border-top:1px solid #d9e2ec;color:#5c6b7a;font-size:12px;line-height:1.55;text-align:center">Alerte opérationnelle confidentielle · Les documents restent protégés par votre session GeoArchives.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    input.title,
    `Bonjour ${input.recipientName},`,
    input.message,
    `Référence : ${input.reference}`,
    `Statut : ${input.statusLabel}`,
    ...(input.details ?? []).map((detail) => `${detail.label} : ${detail.value}`),
    "",
    `${input.actionLabel} : ${input.actionUrl}`,
    ...(input.documentUrl ? [`${input.documentLabel ?? "Télécharger le bordereau"} : ${input.documentUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}
