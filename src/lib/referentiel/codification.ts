// Codification FONCTION V3 des cartons et des dossiers (proposition du
// 04/11/2026, référentiel de classement MULCV V3 du 28/10/2026) :
//
//   Carton  : FON-3302-113-0001      fonction · rubrique V3 · identifiant de commune · n° du carton
//   Dossier : FON-3302-113-0001-012  … · rang du dossier dans le carton
//
// La fonction est déduite de la rubrique (jamais saisie) ; l'identifiant de
// commune est celui du référentiel RGPH (CI-COM-113 → 113), figé. Règles
// pures, partagées par l'application et le script de reprise
// deploy/recoder-cotes.mjs (qui lit les mêmes fichiers JSON).
import classementV3 from "./classement-v3.json";
import communesCi from "./communes-ci.json";

export type FonctionCode = "GOV" | "ADM" | "JUR" | "FIN" | "RH" | "FON" | "URB" | "TOP" | "CON" | "LOG" | "PAT" | "CTL" | "SI" | "ARC";

export const FONCTION_LABELS: Record<FonctionCode, string> = {
  GOV: "Gouvernance et pilotage",
  ADM: "Administration et correspondance",
  JUR: "Affaires juridiques et contentieux",
  FIN: "Budget, finances et marchés",
  RH: "Ressources humaines",
  FON: "Domaine et actes fonciers",
  URB: "Urbanisme et aménagement",
  TOP: "Topographie et cartographie",
  CON: "Construction, architecture et maintenance",
  LOG: "Logement et cadre de vie",
  PAT: "Patrimoine immobilier",
  CTL: "Contrôle et investigations",
  SI: "Systèmes d'information et sécurité",
  ARC: "Gestion documentaire et archives",
};

type RubriqueBrute = { code: string; libelle: string; fonction: string; remarque?: string };
type BlocBrut = { code: string; libelle: string; section: string | null; rubriques: RubriqueBrute[] };

export type RubriqueV3 = {
  /** Clé de la rubrique : fonction + n° V3 (« FON-3302 »), unique même quand le V3 réutilise un n°. */
  key: string;
  numero: string;
  fonction: FonctionCode;
  libelle: string;
  remarque: string | null;
  bloc: { code: string; libelle: string };
};

export const BLOCS_V3: Array<{ code: string; libelle: string; rubriques: RubriqueV3[] }> = (classementV3.blocs as BlocBrut[]).map((bloc) => ({
  code: bloc.code,
  libelle: bloc.libelle,
  rubriques: bloc.rubriques.map((r) => ({
    key: `${r.fonction}-${r.code}`,
    numero: r.code,
    fonction: r.fonction as FonctionCode,
    libelle: r.libelle,
    remarque: r.remarque ?? null,
    bloc: { code: bloc.code, libelle: bloc.libelle },
  })),
}));

export const RUBRIQUES_V3: RubriqueV3[] = BLOCS_V3.flatMap((bloc) => bloc.rubriques);
const BY_KEY = new Map(RUBRIQUES_V3.map((r) => [r.key, r]));

/** Rubrique des Dossiers ACD de la DFU (Abidjan) : la rubrique par défaut de l'inventaire. */
export const RUBRIQUE_ACD = "FON-3302";

/**
 * Rubrique ACD des communes dotées d'une direction régionale dans le V3
 * (série 7000 : 7x12, ex. 7102 pour Grand-Bassam). Proposition du § 8.5, à
 * confirmer ; les autres communes gardent 3302.
 */
export const ACD_DIRECTION_REGIONALE: Record<string, string> = {
  "196": "FON-7012", // Yamoussoukro
  "043": "FON-7022", // Bouaké
  "108": "FON-7032", // Korhogo
  "051": "FON-7042", // Daloa
  "153": "FON-7052", // San Pedro
  "050": "FON-7062", // Dabou
  "095": "FON-7072", // Jacqueville
  "038": "FON-7082", // Bonoua
  "016": "FON-7092", // Assinie
  "083": "FON-7102", // Grand-Bassam
};

/** Ancien code de rubrique (V2 : 2010 = Dossiers ACD) vers la rubrique V3. */
export const RUBRIQUE_V2_VERS_V3: Record<string, string> = { "2010": RUBRIQUE_ACD };

/** Rubrique désignée par sa clé (FON-3302), ou par un ancien code V2 (2010). */
export function findRubriqueV3(value: string | null | undefined): RubriqueV3 | null {
  const text = (value ?? "").trim().toUpperCase();
  return BY_KEY.get(text) ?? BY_KEY.get(RUBRIQUE_V2_VERS_V3[text] ?? "") ?? null;
}

/** Rubrique effectivement codée pour une commune : les ACD d'une commune à direction régionale passent en 7x12. */
export function rubriquePourCommune(key: string, identifiant: string | null | undefined): string {
  return key === RUBRIQUE_ACD && identifiant && ACD_DIRECTION_REGIONALE[identifiant] ? ACD_DIRECTION_REGIONALE[identifiant] : key;
}

export const rubriqueV3Label = (rubrique: RubriqueV3) => `${rubrique.fonction}-${rubrique.numero} · ${rubrique.libelle}`;

// ── Communes ────────────────────────────────────────────────────────────

export type CommuneCi = { identifiant: string; nom: string; district: string | null; region: string | null; departement: string | null };

export const COMMUNES_CI: CommuneCi[] = (communesCi as Array<CommuneCi & { rapprochement?: string }>).map(({ identifiant, nom, district, region, departement }) => ({
  identifiant, nom, district, region, departement,
}));

export function simplifyCommuneName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Variantes de noms rencontrées dans les fiches et le V3 (nom simplifié → identifiant). */
const VARIANTES: Record<string, string> = { assiniemafia: "016", portbouet: "147", portbouetvridi: "147", sanpedro: "153", jacquesville: "095" };
const BY_NAME = new Map(COMMUNES_CI.map((c) => [simplifyCommuneName(c.nom), c]));

/** Commune du référentiel reconnue à son nom (« Port Bouet », « PORT-BOUËT »…). */
export function communeCiParNom(nom: string | null | undefined): CommuneCi | null {
  const key = simplifyCommuneName(nom ?? "");
  if (!key) return null;
  const direct = BY_NAME.get(key);
  if (direct) return direct;
  const id = VARIANTES[key];
  return id ? COMMUNES_CI.find((c) => c.identifiant === id) ?? null : null;
}

export function communeCiParIdentifiant(identifiant: string | null | undefined) {
  return COMMUNES_CI.find((c) => c.identifiant === identifiant) ?? null;
}
