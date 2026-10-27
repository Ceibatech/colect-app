// Recherche « au fil de la frappe » des files de production : règles pures,
// partagées par le service (serveur) et testées sans base.

export const SUGGEST_STAGES = ["preparation", "numerisation", "conditionnement", "indexation", "archivage"] as const;
export type SuggestStage = (typeof SUGGEST_STAGES)[number];

export type CartonSuggestion = { kind: "carton"; cartonId: number; reference: string; label: string | null; dossiers: number; href: string };
export type DossierSuggestion = { kind: "dossier"; id: number; reference: string; titulaire: string | null; carton: string | null; href: string };
export type Suggestion = CartonSuggestion | DossierSuggestion;

export const STAGE_PATHS: Record<SuggestStage, string> = {
  preparation: "/preparation",
  numerisation: "/numerisation",
  conditionnement: "/conditionnement",
  indexation: "/indexation",
  archivage: "/archivage",
};

const STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "et", "n", "no"]);

/** Mots utiles de la saisie : sans accents ni ponctuation, mots vides retirés. */
export function queryWords(query: string): string[] {
  const words = query
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, 6);
}

/** « CTN-00000115 », « ctn115 », « CTN 115 » → 115. Un nombre seul n'est pas un carton (il peut être un numéro de lot). */
export function cartonIdFromQuery(query: string): number | null {
  const match = /^\s*ctn[\s-]*0*(\d{1,10})\s*$/i.exec(query);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

export function formatCartonRef(id: number) {
  return `CTN-${String(id).padStart(8, "0")}`;
}

/** Nombre de mots de la saisie présents dans le texte (sans accents ni casse). */
export function matchScore(text: string, words: string[]) {
  const simple = text.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  return words.filter((word) => simple.includes(word)).length;
}

/** Où mène une suggestion : le carton ouvert dans la file, ou la fiche du dossier pour les étapes finales. */
export function cartonHref(stage: SuggestStage, cartonId: number) {
  const base = STAGE_PATHS[stage];
  return stage === "indexation" || stage === "archivage"
    ? `${base}?statut=TOUS&q=${formatCartonRef(cartonId)}`
    : `${base}?statut=TOUS&carton=${encodeURIComponent(`carton:${cartonId}`)}`;
}

export function dossierHref(stage: SuggestStage, dossier: { id: number; cartonId: number | null; reference: string }) {
  if (stage === "indexation" || stage === "archivage") return `/dossiers/${dossier.id}?tab=${stage}&from=${stage}`;
  if (dossier.cartonId) return cartonHref(stage, dossier.cartonId);
  return `${STAGE_PATHS[stage]}?statut=TOUS&q=${encodeURIComponent(dossier.reference)}`;
}
