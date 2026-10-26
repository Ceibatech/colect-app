/**
 * Règles du reconditionnement par dossier. Plusieurs agents peuvent
 * reconditionner le même carton, chacun un dossier à la fois : le chrono
 * démarre quand il commence le dossier et s'arrête quand il répond à la
 * question de fin.
 */

/** Un dossier commencé et laissé plus de 2 h peut être repris par un autre agent. */
export const RECONDITIONNEMENT_TAKEOVER_MS = 2 * 60 * 60 * 1000;

export const ETAT_REMISE_QUESTION = "Le dossier est-il remis dans son état initial (pièces dans l'ordre, attaches et chemise remises) ?";

export const ETAT_REMISE_LABELS = {
  ETAT_INITIAL: "Oui, remis dans son état initial",
  AVEC_RESERVE: "Non, avec une réserve",
} as const;

export type EtatRemise = keyof typeof ETAT_REMISE_LABELS;

export function durationSeconds(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000));
}

/** « 1 h 05 min », « 12 min 30 s », « 45 s ». */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes > 0) return rest ? `${minutes} min ${String(rest).padStart(2, "0")} s` : `${minutes} min`;
  return `${rest} s`;
}

/** Une réserve doit être expliquée, pour que l'indexation et le contrôle sachent quoi vérifier. */
export function finishError(etat: EtatRemise, observations: string | undefined): string | null {
  if (etat === "AVEC_RESERVE" && !observations?.trim()) return "Décrivez la réserve : pièce manquante, abîmée, ordre impossible à rétablir…";
  return null;
}

export function isTakeoverAllowed(startedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - startedAt.getTime() >= RECONDITIONNEMENT_TAKEOVER_MS;
}
