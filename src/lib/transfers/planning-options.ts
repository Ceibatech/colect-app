/**
 * Listes fermées de la planification d'une opération de transfert. Le libellé
 * choisi est figé dans le lot (texte imprimé sur la F01) ; « Autre » exige une
 * précision libre.
 */

export const OTHER_OPTION = "AUTRE" as const;

export const TRANSPORT_METHODS = [
  { value: "VEHICULE_CEIBA", label: "Véhicule fermé dédié CEIBA" },
  { value: "VEHICULE_MINISTERE", label: "Véhicule du ministère" },
  { value: "LOCATION_CHAUFFEUR", label: "Véhicule de location avec chauffeur" },
  { value: "FOURGON_PRESTATAIRE", label: "Fourgon sécurisé d'un prestataire agréé" },
  { value: "REMISE_MAIN_PROPRE", label: "Remise en main propre (site voisin)" },
] as const;

export const TRANSFER_RISKS = [
  { value: "PERTE", label: "Perte ou égarement de cartons" },
  { value: "VOL", label: "Vol ou intrusion" },
  { value: "DETERIORATION", label: "Détérioration physique (chocs, écrasement)" },
  { value: "INTEMPERIES", label: "Intempéries, humidité ou poussière" },
  { value: "INCENDIE", label: "Incendie" },
  { value: "CONFIDENTIALITE", label: "Accès non autorisé, atteinte à la confidentialité" },
  { value: "ACCIDENT", label: "Accident ou panne pendant le trajet" },
  { value: "CONCORDANCE", label: "Écart entre inventaire et bordereau" },
] as const;

export const SECURITY_MEASURES = [
  { value: "SCELLES", label: "Cartons fermés et scellés numérotés" },
  { value: "INVENTAIRE_CONTRADICTOIRE", label: "Inventaire contradictoire CEIBA–SDA avant chargement" },
  { value: "VEHICULE_FERME", label: "Véhicule fermé à clé, chargement non visible" },
  { value: "CONVOYEUR_A_BORD", label: "Convoyeur CEIBA à bord pendant tout le trajet" },
  { value: "SUIVI_GPS", label: "Suivi GPS du convoi en temps réel" },
  { value: "TRAJET_DIRECT", label: "Trajet direct, sans arrêt non planifié" },
  { value: "PROTECTION_HUMIDITE", label: "Protection contre la pluie et l'humidité" },
  { value: "ACCES_CONTROLE", label: "Accès contrôlé aux zones de chargement et de déchargement" },
  { value: "SUPPORTS_CHIFFRES", label: "Supports électroniques chiffrés" },
  { value: "ESCORTE", label: "Escorte de sécurité pour les lots sensibles" },
] as const;

type Option = { readonly value: string; readonly label: string };

/** Libellé figé d'un choix unique ; null si la valeur ou la précision manque. */
export function resolveSingleChoice(options: readonly Option[], value: string, other: string | null | undefined): string | null {
  if (value === OTHER_OPTION) {
    const detail = other?.trim();
    return detail && detail.length >= 2 ? `Autre : ${detail}` : null;
  }
  return options.find((option) => option.value === value)?.label ?? null;
}

/**
 * Libellés figés d'un choix multiple, dans l'ordre de la liste puis « Autre ».
 * Retourne null pour une valeur inconnue ou un « Autre » sans précision.
 */
export function resolveMultiChoice(options: readonly Option[], values: readonly string[], other: string | null | undefined): string[] | null {
  const chosen = new Set(values);
  for (const value of chosen) {
    if (value !== OTHER_OPTION && !options.some((option) => option.value === value)) return null;
  }
  const labels = options.filter((option) => chosen.has(option.value)).map((option) => option.label);
  if (chosen.has(OTHER_OPTION)) {
    const detail = other?.trim();
    if (!detail || detail.length < 2) return null;
    labels.push(`Autre : ${detail}`);
  }
  return labels;
}
