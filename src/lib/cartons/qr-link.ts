/**
 * Lien encodé dans les QR codes des cartons et dossiers : la page « Scanner
 * une étiquette » du portail MULCV, qui ouvre l'emplacement du carton ou du
 * dossier transféré par GeoArchives. La référence (cote ou ancien CTN) est
 * passée en paramètre, et reste lisible par le scanner de GeoArchives.
 *
 * Réglable sans redéployer le code par QR_LINK_TEMPLATE, où {ref} est
 * remplacé par la référence encodée.
 */
export const DEFAULT_QR_LINK_TEMPLATE = "https://mulcv-dev.ceiba-analytics.com/app/portal/conteneurs?etiquette={ref}";

export function qrLink(reference: string, template?: string | null) {
  const pattern = template?.trim() && template.includes("{ref}") ? template.trim() : DEFAULT_QR_LINK_TEMPLATE;
  return pattern.replaceAll("{ref}", encodeURIComponent(reference.trim()));
}
