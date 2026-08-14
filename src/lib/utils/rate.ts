/**
 * Taux (%) protégé contre la division par zéro, arrondi à 1 décimale.
 * Fonction pure extraite de `dashboard-service.ts` (qui porte "server-only")
 * pour rester testable unitairement (Phase 13, §72) sans dépendre de Prisma
 * ni d'un contexte serveur Next.js — même logique de séparation que
 * `quality-scoring.ts` / `quality-service.ts`.
 */
export function computeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
