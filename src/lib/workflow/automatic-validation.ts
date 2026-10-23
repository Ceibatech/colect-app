import type { AnomalieGravite, AnomalieType, AutomaticIndexStatus } from "@prisma/client";

export interface AutomaticValidationIssue {
  champ: string;
  type: AnomalieType;
  gravite: AnomalieGravite;
  description: string;
}

export interface InventoryValidationInput {
  codeBarres: string | null;
  duplicateBarcode: boolean;
  siteId: number | null;
  entrepotId: number | null;
  entrepotSiteId: number | null;
  etatCarton: "BON_ETAT" | "DEGRADE" | null;
  etatCartonDescription: string | null;
  etatDossier: "BON_ETAT" | "DEGRADE" | null;
  etatDossierDescription: string | null;
}

export interface AutomaticValidationDecision {
  autoValidated: boolean;
  score: number;
  issues: AutomaticValidationIssue[];
}

function hasText(value: string | null) {
  return Boolean(value?.trim());
}

/**
 * Contrôle bloquant de la fiche à la soumission. Les champs facultatifs
 * restent suivis par les indicateurs de complétude, mais ne cassent pas la
 * chaîne de traitement. Seules les incohérences nécessitant une décision
 * humaine sont envoyées au superviseur.
 */
export function evaluateInventorySubmission(input: InventoryValidationInput): AutomaticValidationDecision {
  const issues: AutomaticValidationIssue[] = [];

  if (!hasText(input.codeBarres)) {
    issues.push({
      champ: "codeBarres",
      type: "CHAMP_MANQUANT",
      gravite: "ELEVEE",
      description: "Le code-barres du dossier n'est pas renseigné.",
    });
  } else if (input.duplicateBarcode) {
    issues.push({
      champ: "codeBarres",
      type: "DOUBLON",
      gravite: "CRITIQUE",
      description: `Le code-barres ${input.codeBarres} est déjà utilisé par un autre dossier.`,
    });
  }

  if (input.entrepotId && (!input.siteId || input.entrepotSiteId !== input.siteId)) {
    issues.push({
      champ: "entrepotId",
      type: "INCOHERENCE",
      gravite: "ELEVEE",
      description: "L'entrepôt sélectionné n'appartient pas au site d'inventaire.",
    });
  }

  if (input.etatCarton === "DEGRADE" && !hasText(input.etatCartonDescription)) {
    issues.push({
      champ: "etatCartonDescription",
      type: "CHAMP_MANQUANT",
      gravite: "ELEVEE",
      description: "Le carton est déclaré dégradé sans description du constat.",
    });
  }

  if (input.etatDossier === "DEGRADE" && !hasText(input.etatDossierDescription)) {
    issues.push({
      champ: "etatDossierDescription",
      type: "CHAMP_MANQUANT",
      gravite: "ELEVEE",
      description: "Le dossier est déclaré dégradé sans description du constat.",
    });
  }

  return {
    autoValidated: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 25),
    issues,
  };
}

export type AutomaticDossierIndexationStatus = "EN_COURS" | "A_VALIDER" | "TERMINE";

export function decideDossierIndexationStatus(
  statuses: AutomaticIndexStatus[],
): AutomaticDossierIndexationStatus | null {
  if (statuses.length === 0) return null;
  if (statuses.some((status) => ["A_TRAITER", "EN_FILE", "EN_COURS", "DEUXIEME_LECTURE"].includes(status))) {
    return "EN_COURS";
  }
  if (statuses.some((status) => status === "A_REQUALIFIER" || status === "ERREUR")) {
    return "A_VALIDER";
  }
  return "TERMINE";
}
