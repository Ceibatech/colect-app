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

const COTE = /^(\d{4})-([A-Z][A-Z0-9]{1,5})-(\d{4,6})(?:-(\d{3,4}))?$/;

/** « 2010-kou-0001-012 » → { carton: "2010-KOU-0001", rang: 12 }. */
export function parseCote(value: string): { carton: string; rang: number | null } | null {
  const match = COTE.exec(value.trim().toUpperCase());
  if (!match) return null;
  return { carton: `${match[1]}-${match[2]}-${match[3]}`, rang: match[4] ? Number(match[4]) : null };
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

/** Cote du carton déduite de celle du dossier (2010-KOU-0001-012 → 2010-KOU-0001). */
export function cartonCoteOf(dossierCote: string | null | undefined): string | null {
  return dossierCote ? parseCote(dossierCote)?.carton ?? null : null;
}
