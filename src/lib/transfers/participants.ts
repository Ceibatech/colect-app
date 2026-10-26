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
