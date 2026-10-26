/**
 * Règles de suppression d'un compte (Administration → Utilisateurs).
 *
 * Un compte qui a laissé une trace métier (dossiers, transitions de workflow,
 * documents, transferts...) ne peut pas être supprimé : l'historique perdrait
 * son auteur. Seule sa désactivation reste possible. Un compte sans trace
 * (créé par erreur, compte de démonstration, invitation jamais utilisée) peut
 * l'être ; ses simples événements d'audit sont conservés sans auteur, et une
 * entrée USER_DELETE garde son identité.
 */

export const USER_DELETION_BLOCKERS = {
  dossierHistory: "historique de dossiers",
  workflowTransitions: "transitions de workflow",
  documentsUploaded: "documents déposés",
  documentsPreIndexed: "documents pré-indexés",
  imports: "imports",
  exports: "exports",
  qualityChecks: "contrôles qualité",
  anomaliesCorrected: "anomalies corrigées",
  dossiersPrepared: "dossiers préparés",
  dossiersConditioned: "dossiers reconditionnés",
  preparationPieceLines: "lignes de préparation",
  financeRatesCreated: "barèmes financiers créés",
  transferLotsCreated: "lots de transfert créés",
  transferLotsAuthorized: "lots de transfert autorisés",
  transferLotsCeibacValidated: "lots de transfert visés CEIBA",
  transferMovementsCreated: "mouvements de transfert créés",
  transferMovementsCeibacValidated: "mouvements visés CEIBA",
  transferMovementsMinistryValidated: "mouvements contre-signés",
  transferSignaturesCaptured: "signatures de transfert",
  transferTrackingPoints: "points de suivi GPS",
  transferLotParticipations: "participations à des lots de transfert",
  emailReportSubscriptionsCreated: "abonnements de rapport créés",
  operateurDossiers: "dossiers ou étapes rattachés à sa fiche opérateur",
  supervisedOperateurs: "opérateurs encore affectés",
} as const;

export type UserDeletionBlockerKey = keyof typeof USER_DELETION_BLOCKERS;

/** Libellés des traces présentes (compteur > 0), dans l'ordre de la liste. */
export function userDeletionBlockers(counts: Partial<Record<UserDeletionBlockerKey, number>>): string[] {
  return (Object.keys(USER_DELETION_BLOCKERS) as UserDeletionBlockerKey[])
    .filter((key) => (counts[key] ?? 0) > 0)
    .map((key) => `${counts[key]} ${USER_DELETION_BLOCKERS[key]}`);
}

/** La personne qui confirme doit retaper l'e-mail du compte, sans tenir compte de la casse. */
export function isDeletionConfirmed(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase();
}
