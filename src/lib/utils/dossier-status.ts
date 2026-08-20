import type {
  StatutCollecte,
  StatutValidation,
  StatutNumerisation,
  StatutIndexation,
  StatutArchivage,
} from "@prisma/client";

export const STATUT_COLLECTE_LABELS: Record<StatutCollecte, string> = {
  BROUILLON: "Brouillon",
  SOUMIS: "Soumis",
};

export const STATUT_VALIDATION_LABELS: Record<StatutValidation, string> = {
  EN_ATTENTE: "En attente",
  EN_CONTROLE: "En contrôle",
  VALIDE: "Validé",
  REJETE: "Rejeté",
};

export const STATUT_NUMERISATION_LABELS: Record<StatutNumerisation, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  A_VALIDER: "À valider",
  TERMINE: "Terminé",
  REJETE: "Rejeté",
};

export const STATUT_INDEXATION_LABELS: Record<StatutIndexation, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  A_VALIDER: "À valider",
  TERMINE: "Terminé",
  REJETE: "Rejeté",
};

export const STATUT_ARCHIVAGE_LABELS: Record<StatutArchivage, string> = {
  EN_ATTENTE: "En attente",
  EN_COURS: "En cours",
  A_VALIDER: "À valider",
  TERMINE: "Terminé",
  REJETE: "Rejeté",
};

/** Variante de badge shadcn/ui selon la sémantique du statut. */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function statutBadgeVariant(
  statut: StatutCollecte | StatutValidation | StatutNumerisation | StatutIndexation | StatutArchivage
): BadgeVariant {
  switch (statut) {
    case "VALIDE":
    case "TERMINE":
    case "SOUMIS":
      return "default";
    case "REJETE":
      return "destructive";
    case "EN_CONTROLE":
    case "EN_COURS":
    case "A_VALIDER":
      return "secondary";
    default:
      return "outline";
  }
}
