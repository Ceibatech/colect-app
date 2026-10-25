/**
 * Le transfert est un service dans les deux sens : prise en charge des archives
 * du ministère par CEIBA, puis restitution de CEIBA au ministère. Le circuit
 * (visa interne, visa SDA, F02, F03 contre-signée) est identique dans les deux.
 */
export type SiteOrganisationCode = "MINISTERE" | "CEIBA" | "AUTRE";
export type TransferDirection = "PRISE_EN_CHARGE" | "RESTITUTION";

export const TRANSFER_DIRECTIONS: Record<TransferDirection, { label: string; source: SiteOrganisationCode; destination: SiteOrganisationCode }> = {
  PRISE_EN_CHARGE: { label: "Ministère → CEIBA (prise en charge)", source: "MINISTERE", destination: "CEIBA" },
  RESTITUTION: { label: "CEIBA → Ministère (restitution)", source: "CEIBA", destination: "MINISTERE" },
};

export function resolveTransferDirection(source: SiteOrganisationCode, destination: SiteOrganisationCode): TransferDirection | null {
  if (source === "MINISTERE" && destination === "CEIBA") return "PRISE_EN_CHARGE";
  if (source === "CEIBA" && destination === "MINISTERE") return "RESTITUTION";
  return null;
}
