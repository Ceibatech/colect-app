interface PasswordAccessEmailInput {
  name: string;
  email: string;
  resetUrl: string;
  purpose: "RESET" | "ACTIVATE";
  expiresInMinutes: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderPasswordAccessEmail(input: PasswordAccessEmailInput): string {
  const isActivation = input.purpose === "ACTIVATE";
  const title = isActivation ? "Votre accès GeoArchives est prêt" : "Réinitialisez votre mot de passe";
  const action = isActivation ? "Définir mon mot de passe" : "Choisir un nouveau mot de passe";
  const explanation = isActivation
    ? "Un compte professionnel vient d'être créé pour vous. Utilisez le lien sécurisé ci-dessous pour définir votre mot de passe et accéder à votre espace."
    : "Une demande de réinitialisation a été reçue pour votre compte. Utilisez le lien sécurisé ci-dessous pour choisir un nouveau mot de passe.";
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const resetUrl = escapeHtml(input.resetUrl);

  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#eef3f8;font-family:Arial,sans-serif;color:#10243e">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${title}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef3f8">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #d9e2ec;border-radius:8px;overflow:hidden">
          <tr><td style="height:4px;background:#008f7a"></td></tr>
          <tr><td style="padding:36px 40px 12px">
            <p style="margin:0 0 14px;color:#008f7a;font-size:12px;font-weight:700;letter-spacing:1.4px">GEOARCHIVES-MULCV</p>
            <h1 style="margin:0 0 24px;color:#10243e;font-size:28px;line-height:1.25">${title}</h1>
            <p style="margin:0 0 14px;color:#5c6b7a;font-size:15px;line-height:1.65">Bonjour ${name},</p>
            <p style="margin:0 0 14px;color:#5c6b7a;font-size:15px;line-height:1.65">${explanation}</p>
          </td></tr>
          <tr><td align="center" style="padding:16px 40px 28px">
            <div style="margin:0 0 20px;padding:12px 16px;border:1px solid #d9e2ec;border-radius:6px;background:#f7fafc;text-align:left">
              <span style="display:block;margin-bottom:4px;color:#5c6b7a;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase">Identifiant de connexion</span>
              <strong style="color:#10243e;font-size:14px">${email}</strong>
            </div>
            <a href="${resetUrl}" style="display:inline-block;padding:13px 22px;border-radius:6px;background:#2456a6;color:#fff;font-size:15px;font-weight:700;text-decoration:none">${action}</a>
          </td></tr>
          <tr><td style="padding:0 40px 36px">
            <div style="padding:14px 16px;border:1px solid #d9e2ec;border-radius:6px;background:#f7fafc;color:#10243e;font-size:13px;line-height:1.5">Ce lien est personnel, utilisable une seule fois et expire dans ${input.expiresInMinutes} minutes.</div>
            <p style="margin:18px 0 0;color:#5c6b7a;font-size:13px;line-height:1.55">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail. Votre mot de passe actuel restera inchangé.</p>
            <p style="margin:18px 0 0;color:#5c6b7a;font-size:12px;line-height:1.55">Bouton inaccessible ? Copiez cette adresse dans votre navigateur :<br><a href="${resetUrl}" style="color:#2456a6;word-break:break-all">${resetUrl}</a></p>
          </td></tr>
          <tr><td style="padding:20px 40px;border-top:1px solid #d9e2ec;color:#5c6b7a;font-size:12px;text-align:center">CEIBA Analytics · Accès documentaire sécurisé</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
