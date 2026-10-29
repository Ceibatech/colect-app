import { CEIBA_TRANSFER_ROLE_CODES, SDA_TRANSFER_ROLE_CODES, SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";

export type ParticipantUser = { id: number; name: string; role: { code: string }; responsibleSites?: Array<{ site: { nom: string; organisation: string } }> };

/** Un responsable de site intervient du côté de l'organisation de ses sites. */
export function participantAllowedOnSide(user: ParticipantUser, side: "CEIBA" | "SDA"): boolean {
  const sideRoles: readonly string[] = side === "CEIBA" ? CEIBA_TRANSFER_ROLE_CODES : SDA_TRANSFER_ROLE_CODES;
  if (sideRoles.includes(user.role.code)) return true;
  if (user.role.code !== SITE_RESPONSIBLE_ROLE_CODE) return false;
  const organisation = side === "CEIBA" ? "CEIBA" : "MINISTERE";
  return (user.responsibleSites ?? []).some((row) => row.site.organisation === organisation);
}

export type CandidateUser = { id: number; name: string; role: { code: string }; responsibleSites?: Array<{ site: { id: number; nom: string; organisation: string } }> };

/**
 * Intervenants désignés d'office d'après les responsabilités déjà attribuées :
 * côté CEIBA, le gestionnaire qui crée l'opération (à défaut tous les
 * gestionnaires), les validateurs internes, les convoyeurs et le responsable du
 * site CEIBA concerné ; côté SDA, les responsables validation SDA et le
 * responsable du site du ministère concerné. Rien n'est choisi à la main.
 */
export function designerIntervenants<T extends CandidateUser>(users: T[], ends: { creatorId: number; ceibaSiteId: number | null; ministrySiteId: number | null }) {
  const responsableDe = (user: T, siteId: number | null) =>
    user.role.code === SITE_RESPONSIBLE_ROLE_CODE && siteId != null && (user.responsibleSites ?? []).some((row) => row.site.id === siteId);
  const creatorIsManager = users.some((user) => user.id === ends.creatorId && user.role.code === "GESTIONNAIRE_TRANSFERT");
  const ceiba = users.filter((user) =>
    (user.role.code === "GESTIONNAIRE_TRANSFERT" && (!creatorIsManager || user.id === ends.creatorId))
    || user.role.code === "VALIDATEUR_CEIBAC"
    || user.role.code === "CONVOYEUR"
    || responsableDe(user, ends.ceibaSiteId));
  const ceibaIds = new Set(ceiba.map((user) => user.id));
  const sda = users.filter((user) => !ceibaIds.has(user.id)
    && ((SDA_TRANSFER_ROLE_CODES as readonly string[]).includes(user.role.code) || responsableDe(user, ends.ministrySiteId)));
  return { ceiba, sda };
}
