import { parseCartonReference } from "@/lib/cartons/reference";
import { parseCote } from "@/lib/cartons/cote";

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

/**
 * Cote lue dans un QR (…/c/2010-KOU-0001) ou saisie : « 2010-KOU-0001 ».
 * La cote d'un dossier (…-012) donne celle de son carton.
 */
export function coteFromScan(value: string): string | null {
  const text = decodeURIComponent(value.trim()).split(/[/?#]/).filter(Boolean);
  for (const part of text.reverse()) {
    const cote = parseCote(part);
    if (cote) return cote.carton;
  }
  return null;
}

/** Ce que désigne un scan : la cote (nouvelles étiquettes) ou l'ancien CTN. */
export function cartonKeyFromScan(value: string): { cote: string | null; id: number | null } {
  return { cote: coteFromScan(value), id: cartonIdFromScan(value) };
}
