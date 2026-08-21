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
 * ---
 *
 * SÉMANTIQUE (revue Phase 19+, suite à l'incident du 21/08/2026) : cette
 * route répond désormais **200 même lorsque la base est injoignable**, en
 * signalant l'état dégradé dans le corps de la réponse (`status: "degraded"`,
 * `database: "down"`).
 *
 * Auparavant elle renvoyait 503 dans ce cas — la plateforme retirait alors
 * l'instance du routage, et *toutes* les URL du site (y compris les
 * ressources statiques) tombaient en 502 derrière une page d'erreur opaque
 * de l'hébergeur. Une simple coupure de connectivité base provoquait donc un
 * blackout total, sans message compréhensible pour l'utilisateur ni page de
 * connexion accessible.
 *
 * Compromis assumé, décidé avec le métier : le process Node reste considéré
 * comme sain tant qu'il répond, et l'application demeure joignable (page de
 * connexion, message d'erreur explicite) pendant une panne base.
 * **Contrepartie : la plateforme ne détecte plus automatiquement une base
 * injoignable** — la supervision doit se faire sur le corps de la réponse
 * (`status !== "ok"`), pas sur le code HTTP.
 */

/**
 * Résultat de la dernière sonde base réellement exécutée. La plateforme
 * interroge cette route toutes les quelques secondes ; sans mémorisation cela
 * représentait ~17 000 connexions MySQL par jour depuis une seule IP vers un
 * hébergement mutualisé, ce qui déclenche le pare-feu de l'hébergeur (blocage
 * de l'IP -> base injoignable -> incident du 21/08/2026). On ne sonde donc
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

  // Toujours 200 (cf. SÉMANTIQUE ci-dessus) : c'est le corps qui porte l'état
  // réel. Jamais de détail technique exposé publiquement (§67, même principe
  // que apiErrorResponse()) — juste de quoi distinguer "process up, base
  // injoignable" pour le diagnostic opérationnel.
  return NextResponse.json({
    status: probe.ok ? "ok" : "degraded",
    database: probe.ok ? "up" : "down",
    timestamp: new Date().toISOString(),
    latencyMs: probe.latencyMs,
    cached: probe.cached,
  });
}
