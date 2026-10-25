/**
 * Normalisation de l'identification physique d'un carton (code-barres ou
 * libellé). Les agents saisissent le même libellé avec des variantes de casse
 * ou d'espacement (« Anan cocoteraie 1 » / « Anan Cocoteraie  1 »,
 * « 643-699 zone4/c » / « 643-699 zone 4/c ») : ces variantes désignent le même
 * contenant et doivent recevoir le même identifiant CTN.
 *
 * - Libellé : insensible à la casse, aux accents et à tout espacement.
 * - Code-barres : insensible à l'espacement seulement ; la casse reste
 *   significative (un code scanné est une valeur exacte).
 *
 * Les fautes de frappe (« Anna » / « Anan ») ne sont volontairement PAS
 * fusionnées automatiquement : elles sont listées par
 * `scripts/carton-duplicates.ts` pour une revue humaine.
 *
 * La version SQL (CARTON_LABEL_SQL_EXPR) doit rester alignée : elle retire les
 * espaces (y compris insécables) et laisse la collation utf8mb4_unicode_ci
 * absorber casse et accents.
 */

const WHITESPACE = /[\s   ﻿]+/g;

export type CartonIdentityKind = "code" | "label";

export function normalizeCartonCode(value: string | null | undefined): string | null {
  const normalized = value?.replace(WHITESPACE, "") ?? "";
  return normalized || null;
}

export function normalizeCartonLabel(value: string | null | undefined): string | null {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(WHITESPACE, "");
  return normalized || null;
}

/** Identité canonique : le code-barres prime, le libellé sert en son absence. */
export function normalizeCartonIdentity(identity: {
  codeBarres?: string | null;
  libelleCarton?: string | null;
}): { kind: CartonIdentityKind; value: string } | null {
  const code = normalizeCartonCode(identity.codeBarres);
  if (code) return { kind: "code", value: code };
  const label = normalizeCartonLabel(identity.libelleCarton);
  return label ? { kind: "label", value: label } : null;
}

/** Libellé lisible : bords rognés et espaces internes multiples réduits. */
export function tidyCartonText(value: string | null | undefined): string | null {
  const tidy = value?.replace(WHITESPACE, " ").trim() ?? "";
  return tidy || null;
}

/** Distance d'édition (Levenshtein) bornée, pour signaler les quasi-doublons. */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}
