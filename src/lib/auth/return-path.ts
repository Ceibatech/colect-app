/**
 * Page où renvoyer après connexion. Limité aux fiches carton : un QR code
 * scanné sans être connecté doit rouvrir le carton après la connexion. Toute
 * autre valeur (adresse externe, chemin inattendu) renvoie au tableau de bord.
 */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  const path = value.trim();
  // L'adresse courte du QR code mène directement à la fiche.
  const short = /^\/c\/(CTN-\d{8,10})$/i.exec(path);
  if (short) return `/cartons/${short[1].toUpperCase()}`;
  return /^\/cartons(\/CTN-\d{8,10})?$/i.test(path) ? path : "/dashboard";
}
