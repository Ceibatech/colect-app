/**
 * Règles de suppression d'un compte (Administration → Utilisateurs).
 *
 * Un compte sans trace (créé par erreur, compte de démonstration, invitation
 * jamais utilisée) est supprimé pour de bon ; ses simples événements d'audit
 * sont conservés sans auteur, et une entrée USER_DELETE garde son identité.
 *
 * Un compte qui a laissé une trace métier (dossiers, transitions de workflow,
 * documents, transferts...) est ANONYMISÉ : l'accès, l'identité, la signature
 * et les données personnelles disparaissent, mais les données métier restent,
 * rattachées à « Compte supprimé » (les preuves ne perdent pas leur auteur).
 * Seules les opérateurs encore affectés à un superviseur bloquent : il faut
 * d'abord les réaffecter, sinon plus personne ne pourrait les valider.
 */

export const ANONYMIZED_NAME = "Compte supprimé";
export const ANONYMIZED_EMAIL_DOMAIN = "supprime.invalid";

/** E-mail unique et non délivrable d'un compte anonymisé. */
export function anonymizedEmail(id: number): string {
  return `compte-${id}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

export function isAnonymizedEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`);
}

export const USER_DELETION_BLOCKERS = {
  dossierHistory: "historique de dossiers",
  workflowTransitions: "transitions de workflow",
  documentsUploaded: "documents déposés",
  documentsPreIndexed: "documents pré-indexés",
  indexingJobsRequested: "demandes d'indexation",
  indexingRunsTriggered: "indexations lancées",
  imports: "imports",
  exports: "exports",
  qualityChecks: "contrôles qualité",
  anomaliesCorrected: "anomalies corrigées",
  dossiersPrepared: "dossiers préparés",
  dossiersConditioned: "dossiers reconditionnés",
  reconditionnementSessions: "temps de reconditionnement enregistrés",
  caisseMouvements: "rangements en conteneur",
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
  transferConvoyEvents: "départs ou arrivées de convoi déclarés",
  transferLotParticipations: "participations à des lots de transfert",
  emailReportSubscriptionsCreated: "abonnements de rapport créés",
  emailReportsTriggered: "envois de rapport déclenchés",
  operateurDossiers: "dossiers ou étapes rattachés à sa fiche opérateur",
  supervisedOperateurs: "opérateurs encore affectés",
} as const;

export type UserDeletionBlockerKey = keyof typeof USER_DELETION_BLOCKERS;

/** Traces qui empêchent même l'anonymisation : à traiter avant de supprimer le compte. */
export const USER_DELETION_HARD_BLOCKERS: readonly UserDeletionBlockerKey[] = ["supervisedOperateurs"];

/** Libellés des traces présentes (compteur > 0), dans l'ordre de la liste. */
export function userDeletionBlockers(
  counts: Partial<Record<UserDeletionBlockerKey, number>>,
  only?: readonly UserDeletionBlockerKey[],
): string[] {
  return (Object.keys(USER_DELETION_BLOCKERS) as UserDeletionBlockerKey[])
    .filter((key) => (!only || only.includes(key)) && (counts[key] ?? 0) > 0)
    .map((key) => `${counts[key]} ${USER_DELETION_BLOCKERS[key]}`);
}

/** La personne qui confirme doit retaper l'e-mail du compte, sans tenir compte de la casse. */
export function isDeletionConfirmed(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase();
}
