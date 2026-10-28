/**
 * Page où renvoyer après connexion. Limité aux fiches carton : un QR code
 * scanné sans être connecté doit rouvrir le carton après la connexion. Toute
 * autre valeur (adresse externe, chemin inattendu) renvoie au tableau de bord.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  const path = value.trim();
  // L'adresse courte du QR code mène directement à la fiche.
  // Référence : ancien CTN-00000123 ou cote du référentiel 2010-KOU-0001(-012).
  const ref = "(CTN-\\d{8,10}|\\d{4}-[A-Z][A-Z0-9]{1,5}-\\d{4,6}(?:-\\d{3,4})?)";
  const short = new RegExp(`^/c/${ref}$`, "i").exec(path);
  if (short) return `/cartons/${short[1].toUpperCase()}`;
  return new RegExp(`^/cartons(/${ref})?$`, "i").test(path) ? path : "/dashboard";
}
