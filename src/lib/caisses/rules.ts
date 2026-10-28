// Règles de rangement des cartons dans les caisses (site CEIBA). Pures, testées.

export const CAPACITE_PAR_DEFAUT = 40;

export type CartonPourCaisse = {
  caisseId: number | null;
  dossiers: Array<{ siteId: number | null; statutConditionnement: string }>;
};

/** Raison pour laquelle un carton ne peut pas entrer dans la caisse, ou null s'il le peut. */
export function refusRangement(
  carton: CartonPourCaisse,
  caisse: { id: number; numero: string; siteId: number; capacite: number; occupes: number },
  autreCaisse?: string | null,
): string | null {
  if (carton.caisseId === caisse.id) return null;
  if (carton.caisseId != null) return `Ce carton est déjà rangé dans la caisse ${autreCaisse ?? ""}. Retirez-le d'abord de cette caisse.`.replace("  ", " ");
  if (!carton.dossiers.length) return "Ce carton ne contient aucun dossier.";
  if (carton.dossiers.some((dossier) => dossier.siteId !== caisse.siteId)) {
    return "Ce carton n'est pas enregistré sur le site de la caisse : terminez d'abord son transfert.";
  }
  const restants = carton.dossiers.filter((dossier) => dossier.statutConditionnement !== "TERMINE").length;
  if (restants) return `Reconditionnement non terminé : ${restants} dossier${restants > 1 ? "s" : ""} restant${restants > 1 ? "s" : ""}.`;
  if (caisse.occupes >= caisse.capacite) return `La caisse ${caisse.numero} est pleine (${caisse.capacite} cartons).`;
  return null;
}

/** Numéro de caisse saisi : lettres, chiffres, espaces, - / . (ex. « CAISSE 01 », « C-1 »). */
export function normaliserNumero(value: string): string | null {
  const numero = value.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
  return /^[\p{L}\p{N}][\p{L}\p{N} ./-]{0,39}$/u.test(numero) ? numero : null;
}
