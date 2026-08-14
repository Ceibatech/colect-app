/**
 * Palette catégorielle data-viz — ordre fixe, jamais permuté (voir
 * globals.css et ARCHITECTURE.md). Utilisée par tous les graphiques Recharts
 * pour garantir une identité de série cohérente sur tout le dashboard :
 * Collecte=1, Validation=2, Numérisation=3, Indexation=4, Archivage=5.
 */
export const CHART_COLORS = {
  collecte: "var(--chart-1)",
  validation: "var(--chart-2)",
  numerisation: "var(--chart-3)",
  indexation: "var(--chart-4)",
  archivage: "var(--chart-5)",
} as const;

export const CHART_COLOR_SEQUENCE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;
