import { getRoleLabel, type RoleCode } from "@/lib/permissions/constants";
import { normalizePersonName } from "@/lib/utils/person-name";

/**
 * Identité imprimée sous une signature : le nom et la fonction du compte
 * connecté, jamais une saisie libre. Sans fonction renseignée, le rôle tient lieu
 * de fonction.
 */
export function signataireDe(user: { name: string; fonction: string | null; roleCode: string }) {
  return {
    name: normalizePersonName(user.name),
    title: user.fonction?.trim() || getRoleLabel(user.roleCode as RoleCode) || user.roleCode,
  };
}
