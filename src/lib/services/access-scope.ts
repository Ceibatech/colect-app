import "server-only";
import { prisma } from "@/lib/prisma/client";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Cloisonnement des données par opérateur (Phase 16+ : affectation
 * opérateur -> superviseur, §workflow validation).
 *
 * Deux rôles ont un périmètre restreint à un sous-ensemble d'opérateurs :
 * - OPERATEUR : toujours sa propre fiche (déjà en place avant cette phase,
 *   dupliqué ici pour centraliser la logique — voir chaque appelant).
 * - SUPERVISEUR : les fiches opérateur qui lui ont été explicitement
 *   affectées (`Operateur.supervisorId`, géré depuis
 *   /administration/utilisateurs). Aucune affectation => aucun résultat,
 *   jamais un accès global par défaut — un superviseur non configuré ne
 *   doit rien voir plutôt que tout voir.
 *
 * ADMIN / CONSULTATION : pas de restriction.
 */

/** Fiches opérateur affectées à ce superviseur (`userId` = User.id, rôle SUPERVISEUR). */
export async function getSupervisedOperateurIds(supervisorUserId: number): Promise<number[]> {
  const rows = await prisma.operateur.findMany({
    where: { supervisorId: supervisorUserId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * `null` si la session n'est pas un SUPERVISEUR (pas de restriction à
 * appliquer par ce mécanisme) ; sinon la liste (potentiellement vide) de
 * ses opérateurs affectés. Utilisé par dashboard-service.ts et
 * quality-service.ts pour basculer entre agrégat global (vues SQL /
 * requêtes non filtrées) et agrégat recalculé scopé.
 */
export async function getSupervisorScope(session: SessionPayload): Promise<number[] | null> {
  if (session.roleCode !== "SUPERVISEUR") return null;
  return getSupervisedOperateurIds(session.userId);
}

/**
 * Filtre à assigner à `where.operateurId` d'une requête `dossiers` (ou
 * table liée par `operateurId`) selon le rôle de la session :
 * - `undefined` : pas de restriction à appliquer (ne pas définir la clé).
 * - `number` ou `{ in: number[] }` : restriction à appliquer telle quelle.
 * `-1` est la sentinelle "aucun résultat" (même convention que le reste du
 * code pour un OPERATEUR sans fiche liée, cf. dossier-query-service.ts).
 */
export async function getOperateurScopeFilter(
  session: SessionPayload
): Promise<number | { in: number[] } | undefined> {
  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    return operateur?.id ?? -1;
  }
  if (session.roleCode === "SUPERVISEUR") {
    const ids = await getSupervisedOperateurIds(session.userId);
    return ids.length ? { in: ids } : -1;
  }
  return undefined;
}

/**
 * Vrai si `operateurId` est dans le périmètre de la session — pour un
 * contrôle sur un enregistrement précis (détail dossier, validation d'un
 * dossier donné, téléchargement d'un document...).
 */
export async function isOperateurInScope(session: SessionPayload, operateurId: number): Promise<boolean> {
  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    return operateur?.id === operateurId;
  }
  if (session.roleCode === "SUPERVISEUR") {
    const ids = await getSupervisedOperateurIds(session.userId);
    return ids.includes(operateurId);
  }
  return true;
}
