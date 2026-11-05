// Étiquettes pour imprimante thermique à rouleau (Zebra ZD888T et
// compatibles, 203 dpi = 8 points par mm, largeur utile 104 mm) :
//
//  - format « rouleau » des pages d'impression : une étiquette par page, au
//    format du rouleau, imprimée depuis le navigateur avec le pilote Zebra ;
//  - fichier ZPL, langage natif de l'imprimante, envoyé tel quel (Zebra Setup
//    Utilities, partage réseau) : aucune mise à l'échelle, QR net à 203 dpi.
//
// Le contenu reste celui des planches A4 : cote, rang, repères de collage,
// jamais de nom (le titulaire ne se voit qu'au scan, après connexion).

export type LabelKind = "carton" | "dossier";

/** Rouleaux par défaut : 100 × 50 mm (carton) et 60 × 30 mm (dossier), formats Zebra courants. */
export const ROULEAU_PAR_DEFAUT: Record<LabelKind, { largeur: number; hauteur: number }> = {
  carton: { largeur: 100, hauteur: 50 },
  dossier: { largeur: 60, hauteur: 30 },
};

/** Limites du ZD888T : support de 25,4 à 112 mm de large, impression utile 104 mm. */
const LARGEUR = { min: 25, max: 104 };
const HAUTEUR = { min: 15, max: 200 };

export type RollSize = { largeur: number; hauteur: number };

function clampMm(value: unknown, fallback: number, { min, max }: { min: number; max: number }) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Math.round(number) : fallback;
}

/** Format du rouleau demandé (?l=100&h=50), borné aux capacités de l'imprimante. */
export function rollSize(kind: LabelKind, largeur?: unknown, hauteur?: unknown): RollSize {
  const base = ROULEAU_PAR_DEFAUT[kind];
  return { largeur: clampMm(largeur, base.largeur, LARGEUR), hauteur: clampMm(hauteur, base.hauteur, HAUTEUR) };
}

export const DOTS_PER_MM = 8; // 203 dpi
const dots = (mm: number) => Math.round(mm * DOTS_PER_MM);

/** Texte sûr en ZPL : ^ et ~ sont des commandes, les retours à la ligne aussi. */
export function zplText(value: string | null | undefined) {
  return String(value ?? "").replace(/[\^~\\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Taille du module QR (points) pour tenir dans `sizeDots` : version 5 au plus (37 modules), marge comprise. */
function qrMagnification(sizeDots: number) {
  return Math.max(2, Math.min(10, Math.floor(sizeDots / 41)));
}

export type CartonZplLabel = { reference: string; url: string; libelle: string | null; lieu: string | null };
export type DossierZplLabel = { code: string; url: string; rang: number | null; reperes: string; reference: string };

/**
 * Étiquette de carton en ZPL : QR à gauche (côté = hauteur de l'étiquette moins
 * les marges), cote en gras, libellé sur trois lignes au plus, lieu en pied.
 */
export function cartonZpl(label: CartonZplLabel, size: RollSize) {
  const w = dots(size.largeur);
  const h = dots(size.hauteur);
  const margin = dots(3);
  const qr = h - 2 * margin;
  const mag = qrMagnification(qr);
  const textX = margin + 41 * mag + dots(3);
  const textW = Math.max(dots(20), w - textX - margin);
  const coteH = Math.max(24, Math.min(40, Math.floor(textW / Math.max(10, label.reference.length) * 1.5)));
  return [
    "^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0",
    `^FO${margin},${margin}^BQN,2,${mag}^FDQA,${zplText(label.url)}^FS`,
    `^FO${textX},${margin}^A0N,${coteH},${coteH}^FD${zplText(label.reference)}^FS`,
    `^FO${textX},${margin + coteH + dots(2.5)}^A0N,30,30^FB${textW},3,4,L^FD${zplText(label.libelle) || "Sans libellé"}^FS`,
    label.lieu ? `^FO${textX},${h - margin - 40}^A0N,18,18^FB${textW},2,2,L^FD${zplText(label.lieu)}^FS` : "",
    "^PQ1", "^XZ",
  ].filter(Boolean).join("\n");
}

/** Étiquette de dossier en ZPL : QR à gauche, cote, rang et repères de collage. */
export function dossierZpl(label: DossierZplLabel, size: RollSize) {
  const w = dots(size.largeur);
  const h = dots(size.hauteur);
  const margin = dots(2);
  const qr = h - 2 * margin;
  const mag = qrMagnification(qr);
  const textX = margin + 41 * mag + dots(2);
  const textW = Math.max(dots(15), w - textX - margin);
  const coteH = Math.max(16, Math.min(26, Math.floor(textW / Math.max(10, label.code.length) * 1.5)));
  const lines = [
    `^FO${textX},${margin}^A0N,${coteH},${coteH}^FD${zplText(label.code)}^FS`,
    label.rang ? `^FO${textX},${margin + coteH + 6}^A0N,20,20^FDDossier n° ${label.rang}^FS` : "",
    `^FO${textX},${margin + coteH + 32}^A0N,20,20^FB${textW},3,2,L^FD${zplText(label.reperes)}^FS`,
  ];
  return [
    "^XA", "^CI28", `^PW${w}`, `^LL${h}`, "^LH0,0",
    `^FO${margin},${margin}^BQN,2,${mag}^FDQA,${zplText(label.url)}^FS`,
    ...lines,
    "^PQ1", "^XZ",
  ].filter(Boolean).join("\n");
}

/** Repères de collage d'un dossier : îlot, lot, titre foncier (jamais le nom). */
export function reperesDossier(d: { numeroIlot?: string | null; numeroLot?: string | null; numeroTitreFoncier?: string | null }) {
  // « TF » n'est ajouté que si le numéro ne le porte pas déjà (TF-4947703).
  const tf = d.numeroTitreFoncier ? (/^TF\b/i.test(d.numeroTitreFoncier.trim()) ? d.numeroTitreFoncier.trim() : `TF ${d.numeroTitreFoncier.trim()}`) : null;
  return [d.numeroIlot && `Îlot ${d.numeroIlot}`, d.numeroLot && `Lot ${d.numeroLot}`, tf].filter(Boolean).join(" · ") || "Sans îlot ni lot";
}
