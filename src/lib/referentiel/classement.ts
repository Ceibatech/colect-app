// Référentiel de classement des archives du MULCV — version 3.00 du 28/10/2026
// (codification FONCTION V3). La rubrique choisie à l'inventaire ouvre la cote
// du carton (FON-3302-113-0001) et fixe la nature de ses dossiers (nature =
// rubrique du carton). L'ancien référentiel V2 (2010 = Dossiers ACD) reste
// reconnu dans les cotes déjà attribuées.
import { parseCoteDetail } from "@/lib/cartons/cote";
import { BLOCS_V3, FONCTION_LABELS, findRubriqueV3, RUBRIQUE_V2_VERS_V3, type FonctionCode, type RubriqueV3 } from "@/lib/referentiel/codification";

/** code = clé de la rubrique V3 (« FON-3302 ») : c'est aussi le code de la nature des dossiers. */
export type Rubrique = { code: string; numero: string; fonction: FonctionCode; libelle: string };
export type Serie = { code: string; libelle: string; rubriques: Rubrique[] };

const toRubrique = (r: RubriqueV3): Rubrique => ({ code: r.key, numero: r.numero, fonction: r.fonction, libelle: r.libelle });

/** Les rubriques V3, groupées par bloc du référentiel (Cabinet, DFU, directions régionales…). */
export const REFERENTIEL_CLASSEMENT: Serie[] = BLOCS_V3.map((bloc) => ({ code: bloc.code, libelle: bloc.libelle, rubriques: bloc.rubriques.map(toRubrique) }));

export const RUBRIQUES = REFERENTIEL_CLASSEMENT.flatMap((serie) => serie.rubriques.map((rubrique) => ({ ...rubrique, serie })));

/** Rubrique désignée par sa clé (FON-3302) ou par un ancien code V2 (2010). */
export function findRubrique(code: string | null | undefined): Rubrique | null {
  const rubrique = findRubriqueV3(code);
  return rubrique ? toRubrique(rubrique) : null;
}

/** Rubrique d'un carton, lue dans sa cote (FON-3302-113-0001 → FON-3302 ; ancienne 2010-KOU-0001 → FON-3302). */
export function rubriqueOfCote(cote: string | null | undefined) {
  const detail = cote ? parseCoteDetail(cote) : null;
  if (!detail) return null;
  return detail.format === "nouveau" ? findRubrique(`${detail.fonction}-${detail.rubrique}`) : findRubrique(RUBRIQUE_V2_VERS_V3[detail.rubrique] ?? null);
}

/** Libellé affiché d'une rubrique : « FON-3302 · Dossiers ACD ». */
export const rubriqueLabel = (rubrique: Rubrique) => `${rubrique.code} · ${rubrique.libelle}`;

export const fonctionLabel = (code: FonctionCode) => FONCTION_LABELS[code];
