// Cotes du référentiel de classement des archives du MULCV (V2 du 07/09/2026).
//
//   Carton  : 2010-KOU-0001        classement · commune · n° du carton dans la commune
//   Dossier : 2010-KOU-0001-012    … · rang du dossier dans le carton (le suivant est n+1)
//
// 2010 = « Dossiers ACD » (série 2000, Gestion des actes du foncier). Règles
// pures, partagées par le serveur et les scripts de reprise (miroir dans
// deploy/assign-cotes.mjs : garder les deux alignés).

export const CLASSEMENT_ACD = "2010";
export const SIGLE_INCONNU = "XXX";

/** Sigles fixés pour les communes connues (Abidjan et environs). */
export const SIGLES_CONNUS: Record<string, string> = {
  abobo: "ABO", adjame: "ADJ", anyama: "ANY", attecoube: "ATT", bingerville: "BIN",
  cocody: "COC", koumassi: "KOU", marcory: "MAR", plateau: "PLA", portbouet: "PBT",
  songon: "SON", treichville: "TRE", yopougon: "YOP", adzope: "ADZ", aboisso: "ABS",
  grandbassam: "GBA", dabou: "DAB", jacqueville: "JAC", bonoua: "BNA", alepe: "ALP",
  agboville: "AGB", tiassale: "TIA", yamoussoukro: "YAM", bouake: "BKE", sanpedro: "SPE",
};

export function simplifyName(name: string) {
  return name.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Sigle proposé pour une commune : la table ci-dessus, sinon les 3 premières lettres. */
export function proposeSigle(nom: string): string {
  const key = simplifyName(nom);
  if (SIGLES_CONNUS[key]) return SIGLES_CONNUS[key];
  const letters = key.replace(/[^a-z]/g, "");
  return letters.length >= 3 ? letters.slice(0, 3).toUpperCase() : SIGLE_INCONNU;
}

export function cotePrefixe(sigle: string, classement = CLASSEMENT_ACD) {
  return `${classement}-${sigle}`;
}

export function formatCartonCote(prefixe: string, sequence: number) {
  return `${prefixe}-${String(sequence).padStart(4, "0")}`;
}

export function formatDossierCote(cartonCote: string, rang: number) {
  return `${cartonCote}-${String(rang).padStart(3, "0")}`;
}

// Deux formats cohabitent pendant la migration vers la nouvelle codification :
//
//   nouveau : FON-3302-113-0001[-012]   fonction · rubrique V3 · identifiant de commune · n° du carton [· rang]
//   ancien  : 2010-KOU-0001[-012]       rubrique · sigle de commune · n° du carton [· rang]
//
// Les deux sont lus partout ; seul l'ancien est encore attribué.

/** Préfixe d'une cote (tout sauf le n° du carton), pour construire les motifs de recherche : FON-3302-113 ou 2010-KOU. */
export const COTE_PREFIXE_PATTERN = "(?:[A-Z]{2,3}-\\d{4}-\\d{3}|\\d{4}-[A-Z][A-Z0-9]{1,5})";

const COTE_NOUVEAU = /^([A-Z]{2,3})-(\d{4})-(\d{3})-(\d{4,6})(?:-(\d{3,4}))?$/;
const COTE_ANCIEN = /^(\d{4})-([A-Z][A-Z0-9]{1,5})-(\d{4,6})(?:-(\d{3,4}))?$/;

/** Les 14 fonctions de la nouvelle codification. */
export const FONCTIONS = ["GOV", "ADM", "JUR", "FIN", "RH", "FON", "URB", "TOP", "CON", "LOG", "PAT", "CTL", "SI", "ARC"] as const;
export type Fonction = (typeof FONCTIONS)[number];

export type CoteDetail = {
  format: "nouveau" | "ancien";
  /** Cote du carton, normalisée en majuscules. */
  carton: string;
  /** Préfixe sans le n° du carton (valeur de cotePrefixe) : FON-3302-113 ou 2010-KOU. */
  prefixe: string;
  rubrique: string;
  /** Fonction (nouveau format seulement). */
  fonction: string | null;
  /** Identifiant de commune sur 3 chiffres (nouveau) ou sigle (ancien). */
  commune: string;
  rang: number | null;
};

/** Lit une cote carton ou dossier dans l'un des deux formats. */
export function parseCoteDetail(value: string): CoteDetail | null {
  const text = value.trim().toUpperCase();
  const nouveau = COTE_NOUVEAU.exec(text);
  if (nouveau) {
    const prefixe = `${nouveau[1]}-${nouveau[2]}-${nouveau[3]}`;
    return { format: "nouveau", carton: `${prefixe}-${nouveau[4]}`, prefixe, rubrique: nouveau[2], fonction: nouveau[1], commune: nouveau[3], rang: nouveau[5] ? Number(nouveau[5]) : null };
  }
  const ancien = COTE_ANCIEN.exec(text);
  if (!ancien) return null;
  const prefixe = `${ancien[1]}-${ancien[2]}`;
  return { format: "ancien", carton: `${prefixe}-${ancien[3]}`, prefixe, rubrique: ancien[1], fonction: null, commune: ancien[2], rang: ancien[4] ? Number(ancien[4]) : null };
}

/** « 2010-kou-0001-012 » ou « fon-3302-113-0001-012 » → { carton, rang: 12 }. */
export function parseCote(value: string): { carton: string; rang: number | null } | null {
  const detail = parseCoteDetail(value);
  return detail ? { carton: detail.carton, rang: detail.rang } : null;
}

/** Identifiant de commune sur 3 chiffres, tiré du code de la commune : « CI-113 » → « 113 ». */
export function communeIdentifiant(code: string | null | undefined): string | null {
  const match = /^CI-(\d{3})$/.exec((code ?? "").trim().toUpperCase());
  return match ? match[1] : null;
}

/** Préfixe de la nouvelle codification : ("FON", "3302", "113") → « FON-3302-113 ». */
export function cotePrefixeNouveau(fonction: string, rubrique: string, commune: string): string | null {
  const prefixe = `${fonction}-${rubrique}-${commune}`.toUpperCase();
  return /^[A-Z]{2,3}-\d{4}-\d{3}$/.test(prefixe) && (FONCTIONS as readonly string[]).includes(fonction.toUpperCase()) ? prefixe : null;
}

/** Commune majoritaire d'un carton (la première rencontrée en cas d'égalité). */
export function majorityCommune(communeIds: Array<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const id of communeIds) if (id != null) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) if (count > bestCount) { best = id; bestCount = count; }
  return best;
}

/** Cote du carton déduite de celle du dossier (2010-KOU-0001-012 → 2010-KOU-0001, FON-3302-113-0001-012 → FON-3302-113-0001). */
export function cartonCoteOf(dossierCote: string | null | undefined): string | null {
  return dossierCote ? parseCote(dossierCote)?.carton ?? null : null;
}
