// Règles de chargement des cartons dans les caisses de transport. Pures, testées.
//
// Une caisse sert à l'enlèvement chez le client (cartons du lot « prévus »,
// avant la sortie) et au retour (cartons « reçus », avant le retour). Elle est
// chargée pour un seul lot à la fois et vidée quand le mouvement est finalisé.

export const CAPACITE_PAR_DEFAUT = 40;

/** Statuts d'un carton de lot qui attend un transport : enlèvement (PREVU) ou retour (RECU). */
export const STATUTS_A_TRANSPORTER = ["PREVU", "RECU"] as const;

export type LotEnAttente = { lotId: number; reference: string; statut: string } | null;

/** Raison pour laquelle un carton ne peut pas être chargé dans la caisse, ou null s'il le peut. */
export function refusChargement(
  carton: { caisseId: number | null },
  lot: LotEnAttente,
  caisse: { id: number; numero: string; capacite: number; occupes: number; lotId: number | null; lotReference?: string | null },
  autreCaisse?: string | null,
): string | null {
  if (carton.caisseId === caisse.id) return null;
  if (carton.caisseId != null) return `Ce carton est déjà dans la caisse ${autreCaisse ?? "d'un autre chargement"}. Retirez-le d'abord de cette caisse.`;
  if (!lot) return "Ce carton ne fait partie d'aucun lot en attente d'enlèvement ou de retour.";
  if (caisse.lotId != null && caisse.lotId !== lot.lotId) {
    return `La caisse ${caisse.numero} est chargée pour le lot ${caisse.lotReference ?? caisse.lotId} : une caisse ne transporte qu'un lot à la fois.`;
  }
  if (caisse.occupes >= caisse.capacite) return `La caisse ${caisse.numero} est pleine (${caisse.capacite} cartons).`;
  return null;
}

/** Sens du transport d'après le statut du carton dans son lot. */
export function sensTransport(statut: string) {
  return statut === "RECU" ? "retour" : "enlèvement";
}

/** Numéro de caisse saisi : lettres, chiffres, espaces, - / . (ex. « CAISSE 01 », « C-1 »). */
export function normaliserNumero(value: string): string | null {
  const numero = value.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
  return /^[\p{L}\p{N}][\p{L}\p{N} ./-]{0,39}$/u.test(numero) ? numero : null;
}
