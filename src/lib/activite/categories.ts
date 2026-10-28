// Temps de travail : rattacher une page ou une action enregistrée à une activité.

export const ACTIVITES = [
  { code: "INVENTAIRE", label: "Inventaire" },
  { code: "VALIDATION", label: "Validation" },
  { code: "PREPARATION", label: "Préparation" },
  { code: "NUMERISATION", label: "Numérisation" },
  { code: "RECONDITIONNEMENT", label: "Reconditionnement" },
  { code: "INDEXATION", label: "Indexation" },
  { code: "ARCHIVAGE", label: "Archivage" },
  { code: "TRANSFERTS", label: "Transferts" },
  { code: "CONSULTATION", label: "Consultation" },
  { code: "AUTRES", label: "Autres" },
] as const;

export type ActiviteCode = (typeof ACTIVITES)[number]["code"];

export const ACTIVITE_CODES = new Set<string>(ACTIVITES.map((activite) => activite.code));

/** Minutes sans action au-delà desquelles le temps ne compte plus. */
export const INACTIVITE_MINUTES = 10;

/** Activité d'après la page ouverte (chemin + onglet « tab » de la fiche dossier). */
export function activiteDePage(pathname: string, tab?: string | null): ActiviteCode {
  const path = pathname.toLowerCase();
  if (path.startsWith("/collecte")) return "INVENTAIRE";
  if (path.startsWith("/preparation")) return "PREPARATION";
  if (path.startsWith("/numerisation")) return "NUMERISATION";
  if (path.startsWith("/conditionnement")) return "RECONDITIONNEMENT";
  if (path.startsWith("/indexation")) return "INDEXATION";
  if (path.startsWith("/archivage")) return "ARCHIVAGE";
  if (path.startsWith("/transferts") || path.startsWith("/caisses")) return "TRANSFERTS";
  if (path.startsWith("/qualite")) return "VALIDATION";
  if (path.startsWith("/dossiers/")) {
    const byTab: Record<string, ActiviteCode> = {
      preparation: "PREPARATION", numerisation: "NUMERISATION", conditionnement: "RECONDITIONNEMENT",
      indexation: "INDEXATION", archivage: "ARCHIVAGE", validation: "VALIDATION",
    };
    return (tab && byTab[tab.toLowerCase()]) || "CONSULTATION";
  }
  if (path.startsWith("/dossiers") || path.startsWith("/recherche") || path.startsWith("/cartons")) return "CONSULTATION";
  return "AUTRES";
}

/** Activité d'une ligne d'historique de dossier (action enregistrée). */
export function activiteDAction(action: string): ActiviteCode {
  if (action === "CREATION" || action === "SOUMISSION" || action.startsWith("BROUILLON") || action === "IMPORT") return "INVENTAIRE";
  if (action === "VALIDATION" || action === "REJET" || action.startsWith("CORRECTION") || action.startsWith("ANOMALIE")) return "VALIDATION";
  for (const prefix of ["PREPARATION", "NUMERISATION", "INDEXATION", "ARCHIVAGE"] as const) {
    if (action.startsWith(prefix)) return prefix;
  }
  if (action.startsWith("CONDITIONNEMENT")) return "RECONDITIONNEMENT";
  if (action.startsWith("TRANSFER")) return "TRANSFERTS";
  return "AUTRES";
}

/** « 2 h 05 », « 45 min ». */
export function formatDuree(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** Jour de travail (Abidjan, UTC) au format AAAA-MM-JJ. */
export function jourDe(date: Date) {
  return date.toISOString().slice(0, 10);
}
