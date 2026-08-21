import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

/**
 * GET /api/health — sonde de disponibilité (§61/§100, Phase 15).
 *
 * Volontairement PUBLIC (aucune session requise) : c'est le point vérifié
 * par le health check de la plateforme d'hébergement (Render) pour décider
 * si l'instance reçoit du trafic — exiger une authentification la rendrait
 * inutilisable pour cet usage. Ne renvoie donc aucune donnée métier, juste
 * un statut minimal. `src/proxy.ts` exclut déjà tout `/api/*` de la
 * redirection d'authentification ; cette route ne fait par ailleurs elle-
 * même aucun appel à `requireApiUser`/`requireApiPermission`.
 *
 * Vérifie une connexion base réelle (`SELECT 1`, pas juste "le process
 * tourne") : un process Node up mais une base MySQL injoignable doit être
 * détecté comme non sain par la plateforme.
 *
 * Le résultat de cette sonde est MÉMORISÉ (Phase 19+, suite à l'incident du
 * 21/08/2026). La plateforme interroge cette route toutes les quelques
 * secondes ; sans mémorisation cela représentait ~17 000 connexions MySQL par
 * jour depuis une seule IP vers un hébergement mutualisé, ce qui déclenche le
 * pare-feu de l'hébergeur (blocage de l'IP -> base injoignable -> service
 * entièrement indisponible, la cause exacte de cet incident). On ne sonde donc
 * réellement la base qu'au plus une fois par `PROBE_TTL_MS`, en réutilisant le
 * dernier résultat entre-temps.
 *
 * Conséquence assumée : une panne base peut être signalée avec au plus
 * `PROBE_TTL_MS` de retard — négligeable au regard du risque de blocage.
 */
const PROBE_TTL_MS = 30_000;
let lastProbe: { at: number; ok: boolean; latencyMs: number } | null = null;

async function probeDatabase(): Promise<{ ok: boolean; latencyMs: number; cached: boolean }> {
  if (lastProbe && Date.now() - lastProbe.at < PROBE_TTL_MS) {
    return { ok: lastProbe.ok, latencyMs: lastProbe.latencyMs, cached: true };
  }
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    lastProbe = { at: Date.now(), ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    lastProbe = { at: Date.now(), ok: false, latencyMs: Date.now() - startedAt };
  }
  return { ok: lastProbe.ok, latencyMs: lastProbe.latencyMs, cached: false };
}

export async function GET() {
  const probe = await probeDatabase();

  if (!probe.ok) {
    // Jamais de détail technique exposé publiquement (§67, même principe
    // que apiErrorResponse()) — juste de quoi distinguer "process up, DB
    // injoignable" pour le diagnostic opérationnel.
    return NextResponse.json(
      { status: "error", database: "down", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "ok",
    database: "up",
    timestamp: new Date().toISOString(),
    latencyMs: probe.latencyMs,
    cached: probe.cached,
  });
}
