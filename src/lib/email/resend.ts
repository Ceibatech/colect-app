import "server-only";

import { Resend } from "resend";
import { renderPasswordAccessEmail } from "@/lib/email/password-access-template";

export class EmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

interface PasswordAccessMessage {
  idempotencyKey: string;
  name: string;
  email: string;
  resetUrl: string;
  purpose: "RESET" | "ACTIVATE";
  expiresInMinutes: number;
}

interface TransactionalEmailMessage {
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function getEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey) {
    throw new EmailConfigurationError("RESEND_API_KEY n'est pas configurée.");
  }
  if (!from) {
    throw new EmailConfigurationError("EMAIL_FROM n'est pas configurée.");
  }

  return { apiKey, from };
}

export function getApplicationUrl(): string {
  const configured = process.env.APP_URL?.trim();
  const value = configured || (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:3000");

  if (!value) {
    throw new EmailConfigurationError("APP_URL n'est pas configurée.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EmailConfigurationError("APP_URL doit être une URL absolue valide.");
  }

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new EmailConfigurationError("APP_URL doit utiliser HTTPS en production.");
  }

  return url.toString().replace(/\/$/, "");
}

export function assertEmailConfigured(): void {
  getEmailConfiguration();
  getApplicationUrl();
}

export async function sendTransactionalEmail(message: TransactionalEmailMessage): Promise<string> {
  const { apiKey, from } = getEmailConfiguration();
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    },
    { headers: { "Idempotency-Key": message.idempotencyKey } },
  );

  if (error || !data?.id) {
    throw new EmailDeliveryError(error?.message ?? "Resend n'a pas confirmé l'envoi.");
  }

  return data.id;
}

export async function sendPasswordAccessEmail(message: PasswordAccessMessage): Promise<string> {
  const subject = message.purpose === "ACTIVATE"
    ? "Votre accès GeoArchives"
    : "Réinitialisation de votre mot de passe GeoArchives";

  return sendTransactionalEmail({
    idempotencyKey: message.idempotencyKey,
    to: message.email,
    subject,
    html: renderPasswordAccessEmail({
      name: message.name,
      email: message.email,
      resetUrl: message.resetUrl,
      purpose: message.purpose,
      expiresInMinutes: message.expiresInMinutes,
    }),
  });
}
