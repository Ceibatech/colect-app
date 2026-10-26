/**
 * Périmètre d'un responsable de site. Pour un lot A → B :
 * - SORTIE (remise des cartons, F02) : signée au site de départ A ;
 * - RECEPTION (état des lieux, F03) : signée au site d'arrivée B ;
 * - RETOUR (restitution B → A) : signée au site d'où les cartons repartent, B.
 * Le responsable d'un site ne peut donc signer que les mouvements de son site.
 */
export type MovementTypeCode = "SORTIE" | "RECEPTION" | "RETOUR";

export function movementSiteId(type: MovementTypeCode, fromSiteId: number, toSiteId: number): number {
  return type === "RECEPTION" ? toSiteId : fromSiteId;
}

/** Sites du mouvement (départ, arrivée) selon le sens du lot. */
export function movementEnds(type: MovementTypeCode, lot: { sourceSiteId: number; destinationSiteId: number }) {
  return type === "RETOUR"
    ? { fromSiteId: lot.destinationSiteId, toSiteId: lot.sourceSiteId }
    : { fromSiteId: lot.sourceSiteId, toSiteId: lot.destinationSiteId };
}

export function canSignMovementAtSite(
  type: MovementTypeCode,
  lot: { sourceSiteId: number; destinationSiteId: number },
  responsibleSiteIds: readonly number[] | null,
): boolean {
  // null : profil sans restriction de site (gestionnaire, administrateur).
  if (responsibleSiteIds === null) return true;
  const { fromSiteId, toSiteId } = movementEnds(type, lot);
  return responsibleSiteIds.includes(movementSiteId(type, fromSiteId, toSiteId));
}
