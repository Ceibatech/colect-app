// Référentiel de classement des archives du MULCV — version 2 du 07/09/2026.
// La rubrique choisie à l'inventaire ouvre la cote du carton (2010-KOU-0001)
// et fixe la nature de ses dossiers (nature = rubrique du carton).
import referentiel from "./classement.json";
import { parseCoteDetail } from "@/lib/cartons/cote";

export type Rubrique = { code: string; libelle: string; nature?: string };
export type Serie = { code: string; libelle: string; rubriques: Rubrique[] };

// Source unique : classement.json (aussi lu par le script de reprise deploy/assign-cotes.mjs).
export const REFERENTIEL_CLASSEMENT: Serie[] = referentiel;

export const RUBRIQUES = REFERENTIEL_CLASSEMENT.flatMap((serie) => serie.rubriques.map((rubrique) => ({ ...rubrique, serie })));

export function findRubrique(code: string | null | undefined) {
  return RUBRIQUES.find((rubrique) => rubrique.code === code) ?? null;
}

/** Rubrique d'un carton, lue dans sa cote (2010-KOU-0001 → 2010). */
export function rubriqueOfCote(cote: string | null | undefined) {
  const detail = cote ? parseCoteDetail(cote) : null;
  return detail ? findRubrique(detail.rubrique) : null;
}

/** Libellé affiché d'une rubrique : « 2010 · Dossiers ACD ». */
export const rubriqueLabel = (rubrique: Rubrique) => `${rubrique.code} · ${rubrique.libelle}`;
