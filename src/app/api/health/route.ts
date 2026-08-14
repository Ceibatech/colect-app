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
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    // Jamais de détail technique exposé publiquement (§67, même principe
    // que apiErrorResponse()) — juste de quoi distinguer "process up, DB
    // injoignable" pour le diagnostic opérationnel.
    return NextResponse.json(
      { status: "error", database: "down", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
