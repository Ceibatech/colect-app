import "server-only";
import { headers } from "next/headers";

/** Adresse IP du client, pour la journalisation d'audit (proxy Render inclus). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}
