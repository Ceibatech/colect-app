export const TRANSFER_ITEM_STATUSES = ["PREVU", "SORTI", "RECU", "RETOURNE"] as const;
export type TransferItemStatusCode = (typeof TRANSFER_ITEM_STATUSES)[number];

export const TRANSFER_MOVEMENT_TYPES = ["SORTIE", "RECEPTION", "RETOUR"] as const;
export type TransferMovementTypeCode = (typeof TRANSFER_MOVEMENT_TYPES)[number];

export type TransferLotStatusCode =
  | "BROUILLON"
  | "SOUMIS"
  | "VALIDE_CEIBAC"
  | "AUTORISE"
  | "PARTIELLEMENT_SORTI"
  | "EN_TRANSIT"
  | "RECU_PARTIEL"
  | "CHEZ_CEIBAC"
  | "RETOUR_PARTIEL"
  | "CLOTURE"
  | "ANNULE";

const movementRules: Record<TransferMovementTypeCode, { before: TransferItemStatusCode; after: TransferItemStatusCode }> = {
  SORTIE: { before: "PREVU", after: "SORTI" },
  RECEPTION: { before: "SORTI", after: "RECU" },
  RETOUR: { before: "RECU", after: "RETOURNE" },
};

export function getTransferMovementRule(type: TransferMovementTypeCode) {
  return movementRules[type];
}

export function isTransferMovementChronologyValid(
  type: TransferMovementTypeCode,
  occurredAt: Date,
  item: { departedAt: Date | null; receivedAt: Date | null },
  lotCreatedAt: Date,
) {
  const minimumDate = type === "SORTIE"
    ? lotCreatedAt
    : type === "RECEPTION"
      ? item.departedAt
      : item.receivedAt;
  // L'heure se saisit à la minute : un mouvement daté de la même minute que le
  // jalon précédent (ex. 05:21 après une création à 05:21:56) est valable.
  return minimumDate !== null && occurredAt.getTime() >= Math.floor(minimumDate.getTime() / 60_000) * 60_000;
}

export function deriveTransferLotStatus(
  statuses: readonly TransferItemStatusCode[],
  previous: TransferLotStatusCode,
): TransferLotStatusCode {
  if (previous === "ANNULE") return previous;
  if (statuses.length === 0) return previous;

  const counts = getTransferStockSummary(statuses);
  if (counts.returned === counts.total) return "CLOTURE";
  if (counts.returned > 0) return "RETOUR_PARTIEL";
  if (counts.atCeibac === counts.total) return "CHEZ_CEIBAC";
  if (counts.atCeibac > 0) return "RECU_PARTIEL";
  if (counts.inTransit === counts.total) return "EN_TRANSIT";
  if (counts.inTransit > 0) return "PARTIELLEMENT_SORTI";
  return previous;
}

export function getTransferStockSummary(statuses: readonly TransferItemStatusCode[]) {
  const summary = {
    total: statuses.length,
    notDeparted: 0,
    inTransit: 0,
    atCeibac: 0,
    returned: 0,
    atOrigin: 0,
    outsideOrigin: 0,
  };

  for (const status of statuses) {
    if (status === "PREVU") summary.notDeparted++;
    if (status === "SORTI") summary.inTransit++;
    if (status === "RECU") summary.atCeibac++;
    if (status === "RETOURNE") summary.returned++;
  }
  summary.atOrigin = summary.notDeparted + summary.returned;
  summary.outsideOrigin = summary.inTransit + summary.atCeibac;
  return summary;
}

export function getTransferDossierStockSummary(
  items: readonly { status: TransferItemStatusCode; dossierCountSnapshot: number }[],
) {
  const summary = {
    total: 0,
    notDeparted: 0,
    inTransit: 0,
    atDestination: 0,
    returned: 0,
    atOrigin: 0,
    outsideOrigin: 0,
  };

  for (const item of items) {
    const volume = Math.max(0, item.dossierCountSnapshot);
    summary.total += volume;
    if (item.status === "PREVU") summary.notDeparted += volume;
    if (item.status === "SORTI") summary.inTransit += volume;
    if (item.status === "RECU") summary.atDestination += volume;
    if (item.status === "RETOURNE") summary.returned += volume;
  }
  summary.atOrigin = summary.notDeparted + summary.returned;
  summary.outsideOrigin = summary.inTransit + summary.atDestination;
  return summary;
}

export function getTransferLotStatusLabel(status: TransferLotStatusCode) {
  return {
    BROUILLON: "Brouillon",
    SOUMIS: "Validation interne requise",
    VALIDE_CEIBAC: "Validation SDA requise",
    AUTORISE: "Autorisé",
    PARTIELLEMENT_SORTI: "Sortie partielle",
    EN_TRANSIT: "En transit",
    RECU_PARTIEL: "Réception partielle",
    CHEZ_CEIBAC: "Reçu à destination",
    RETOUR_PARTIEL: "Retour partiel",
    CLOTURE: "Clôturé",
    ANNULE: "Annulé",
  }[status];
}

export type TransferMovementStatusCode = "SOUMIS_CEIBAC" | "VALIDE_CEIBAC" | "VALIDE_MINISTERE" | "REJETE";

export function getTransferMovementStatusLabel(status: TransferMovementStatusCode) {
  return {
    SOUMIS_CEIBAC: "Validation interne requise",
    VALIDE_CEIBAC: "Validation SDA requise",
    VALIDE_MINISTERE: "Validé",
    REJETE: "Rejeté",
  }[status];
}

export function canApplyTransferStock(_type: TransferMovementTypeCode, status: TransferMovementStatusCode) {
  return status === "VALIDE_MINISTERE";
}

export function getTransferItemStatusLabel(status: TransferItemStatusCode) {
  return {
    PREVU: "Encore sur site",
    SORTI: "En transit",
    RECU: "Reçu sur le site B",
    RETOURNE: "Retourné au site A",
  }[status];
}

export function getTransferMovementLabel(type: TransferMovementTypeCode) {
  return { SORTIE: "Sortie du site A", RECEPTION: "Réception au site B", RETOUR: "Retour au site A" }[type];
}
