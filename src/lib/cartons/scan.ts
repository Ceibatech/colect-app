import { parseCartonReference } from "@/lib/cartons/reference";

/**
 * Identifiant de carton lu par une douchette ou saisi : l'adresse du QR code
 * (…/c/CTN-00000123), la référence seule, ou son numéro.
 */
export function cartonIdFromScan(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const match = /CTN-\d{8,10}/i.exec(text);
  if (match) return parseCartonReference(match[0].toUpperCase());
  return null;
}
