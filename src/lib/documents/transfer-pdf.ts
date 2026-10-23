import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { BRAND } from "@/config/branding";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BLUE = rgb(0.16, 0.32, 0.62);
const GREEN = rgb(0.02, 0.55, 0.47);
const TEXT = rgb(0.08, 0.11, 0.16);
const MUTED = rgb(0.36, 0.40, 0.46);
const BORDER = rgb(0.78, 0.81, 0.85);
const SURFACE = rgb(0.95, 0.96, 0.97);

export interface TransferPdfItem {
  cartonCode: string;
  cartonLabel: string | null;
  dossierCount: number;
  dossierReferences: string[];
}

export interface TransferPdfSignature {
  party?: "MINISTERE" | "CEIBAC" | "CEIBAC_VALIDATOR";
  label: string;
  name: string | null;
  title: string | null;
  signedAt: Date | null;
  data: string | null;
}

export interface TransferAuthorizationPdfInput {
  reference: string;
  authorizedAt: Date;
  plannedAt: Date | null;
  motif: string | null;
  source: string;
  sourceAddress: string;
  destination: string;
  destinationAddress: string;
  ministryContact: string;
  ceibaContact: string;
  items: TransferPdfItem[];
  ministrySignature: TransferPdfSignature;
}

export interface TransferMovementPdfInput {
  reference: string;
  lotReference: string;
  type: "SORTIE" | "RECEPTION" | "RETOUR";
  statusLabel: string;
  occurredAt: Date;
  source: string;
  sourceAddress: string;
  destination: string;
  destinationAddress: string;
  conditionLabel: string | null;
  observations: string | null;
  items: TransferPdfItem[];
  signatures: TransferPdfSignature[];
}

export async function createTransferAuthorizationPdf(input: TransferAuthorizationPdfInput) {
  const writer = await PdfWriter.create(`F01 - ${input.reference}`);
  writer.documentHeader(
    "F01",
    "Autorisation de transfert et de garde temporaire",
    `${BRAND.productDescriptor} - Chaîne de garde documentaire`,
  );
  writer.fields([
    ["Autorisation", input.reference],
    ["Solution d'archivage", BRAND.productName],
    ["Service détenteur", input.source],
    ["Responsable", input.ministryContact],
    ["Autorisé le", formatDateTime(input.authorizedAt)],
    ["Transfert prévu", input.plannedAt ? formatDate(input.plannedAt) : "À planifier"],
    ["Site de départ et adresse", `${input.source} - ${input.sourceAddress}`],
    ["Site CEIBA de réception", `${input.destination} - ${input.destinationAddress}`],
  ]);

  writer.section("Périmètre autorisé");
  writer.field("Lots ou références concernés", input.reference);
  writer.field("Volume autorisé", `${input.items.length} boîte${input.items.length > 1 ? "s" : ""} - ${sumDossiers(input.items)} dossier${sumDossiers(input.items) > 1 ? "s" : ""}`);
  writer.field("Prestations autorisées", input.motif || "Transfert, préparation, numérisation, indexation et garde temporaire.");
  writer.field("Documents exclus", "Tout document non repris dans l'inventaire annexé à cette autorisation.");

  writer.section("Interlocuteurs habilités");
  writer.fields([
    ["Ministère pour les remises", input.ministryContact],
    ["CEIBA Analytics pour le transfert", input.ceibaContact],
    ["CEIBA Analytics pour la réception", input.ceibaContact],
  ]);

  writer.section("Inventaire annexé");
  writer.inventory(input.items);

  writer.section("Conditions convenues");
  writer.paragraph("Le ministère autorise la sortie temporaire des documents identifiés dans l'inventaire annexé. CEIBA Analytics en assure la garde entre la remise et la restitution signées. Les originaux restent la propriété du ministère et leur accès est limité aux personnes habilitées.");
  writer.paragraph("Les boîtes sont identifiées, fermées et transportées dans un véhicule fermé dédié. Les anomalies sont signalées sans délai. Les boîtes sont rangées hors sol en zone réservée avec leur localisation enregistrée dans GeoArchives.");

  writer.section("Approbation et engagement");
  await writer.signature(input.ministrySignature);
  await writer.signature({
    label: "Responsable CEIBA Analytics - prise en charge",
    name: input.ceibaContact,
    title: "Gestionnaire du transfert",
    signedAt: null,
    data: null,
  });

  writer.footerNote("F01 conservée par le ministère et CEIBA Analytics. Toute sortie physique doit ensuite être couverte par un bordereau F02.");
  return writer.save();
}

export async function createTransferMovementPdf(input: TransferMovementPdfInput) {
  const writer = await PdfWriter.create(`F02 - ${input.reference}`);
  writer.documentHeader(
    "F02",
    input.type === "RECEPTION" ? "Bordereau de réception et de déchargement" : "Bordereau de transfert et de remise",
    `Un formulaire par déplacement - ${BRAND.documentFooter}`,
  );

  const returns = input.type === "RETOUR";
  const from = returns ? input.destination : input.source;
  const fromAddress = returns ? input.destinationAddress : input.sourceAddress;
  const to = returns ? input.source : input.destination;
  const toAddress = returns ? input.sourceAddress : input.destinationAddress;
  const direction = input.type === "SORTIE"
    ? "Site du ministère vers site CEIBA"
    : input.type === "RETOUR"
      ? "Site CEIBA vers site du ministère"
      : "Réception au site de traitement CEIBA";

  writer.section("A - Identification du déplacement");
  writer.fields([
    ["Sens", direction],
    ["Lot", input.lotReference],
    ["Rotation / bordereau", input.reference],
    ["Date et heure", formatDateTime(input.occurredAt)],
    ["Autorisation F01", input.lotReference],
    ["Adresse de départ", `${from} - ${fromAddress}`],
    ["Adresse d'arrivée", `${to} - ${toAddress}`],
    ["Trajet prévu", "Trajet direct entre les deux sites enregistrés dans GeoArchives."],
    ["Véhicule et immatriculation", "À compléter au départ"],
    ["Chauffeur et téléphone", "À compléter au départ"],
    ["Accompagnateur CEIBA", "À compléter au départ"],
    ["Contact à l'arrivée", "À compléter avant le déplacement"],
  ]);

  writer.section("Boîtes transportées");
  writer.inventory(input.items);
  writer.fields([
    ["Total réel de boîtes", String(input.items.length)],
    ["Total de dossiers", String(sumDossiers(input.items))],
    ["Inventaire joint", "Oui - inventaire GeoArchives annexé"],
    ["Anciennes références conservées", "Oui"],
  ]);

  writer.section(input.type === "RECEPTION" ? "B - Constat de déchargement" : "B - Remise au départ");
  writer.paragraph(input.type === "RECEPTION"
    ? "L'agent CEIBA constate le nombre de boîtes reçues, leur état apparent et les éventuelles réserves avant rangement."
    : "Les signataires constatent ensemble les références, le nombre de boîtes et leur état apparent. Les boîtes sont fermées avant chargement. Les réserves sont reprises dans les observations du bordereau.");
  const ministrySignature = input.type === "RECEPTION" ? undefined : input.signatures.find((signature) => signature.party === "MINISTERE");
  const ceibaSignature = input.signatures.find((signature) => signature.party === "CEIBAC");
  if (input.type !== "RECEPTION") {
    await writer.signature(ministrySignature ?? { label: "Remis par le service ou le site de départ - ministère", name: null, title: null, signedAt: null, data: null });
  }
  await writer.signature(ceibaSignature ?? { label: input.type === "RECEPTION" ? "Constat de l'agent CEIBA à l'arrivée" : "Pris en charge par CEIBA Analytics", name: null, title: null, signedAt: null, data: null });

  writer.section(input.type === "RECEPTION" ? "C - Contrôle et validation de la réception" : "C - Réception à destination");
  writer.fields([
    ["État", input.conditionLabel ?? "À constater à l'arrivée"],
    ["Écart ou réserve", input.observations || "Aucune réserve enregistrée"],
    ["Nombre reçu", input.type === "RECEPTION" ? String(input.items.length) : "À compléter à l'arrivée"],
    ["Emplacement", input.type === "RECEPTION" ? input.destination : "À compléter à l'arrivée"],
  ]);
  for (const signature of input.signatures.filter((signature) => signature !== ministrySignature && (input.type !== "RECEPTION" || signature !== ceibaSignature))) {
    await writer.signature(signature);
  }

  writer.section("Statut du document");
  writer.field("Workflow GeoArchives", input.statusLabel);
  writer.footerNote("Une copie du F02 signé est conservée dans l'espace ministère et dans l'espace CEIBA. Le stock n'est modifié qu'après le visa final requis.");
  return writer.save();
}

class PdfWriter {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  static async create(title: string) {
    const doc = await PDFDocument.create();
    doc.setTitle(title);
    doc.setAuthor(BRAND.documentFooter);
    doc.setCreator(BRAND.productName);
    doc.setProducer("CEIBA Analytics");
    return new PdfWriter(
      doc,
      await doc.embedFont(StandardFonts.Helvetica),
      await doc.embedFont(StandardFonts.HelveticaBold),
    );
  }

  documentHeader(code: string, title: string, subtitle: string) {
    this.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 112, width: PAGE_WIDTH, height: 112, color: BLUE });
    this.page.drawText(code, { x: MARGIN, y: PAGE_HEIGHT - 50, size: 12, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText(clean(title), { x: MARGIN, y: PAGE_HEIGHT - 75, size: 18, font: this.bold, color: rgb(1, 1, 1) });
    this.page.drawText(clean(subtitle), { x: MARGIN, y: PAGE_HEIGHT - 94, size: 9, font: this.regular, color: rgb(0.9, 0.94, 1) });
    this.y = PAGE_HEIGHT - 132;
  }

  section(title: string) {
    this.ensureSpace(36);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 20, width: CONTENT_WIDTH, height: 24, color: SURFACE, borderColor: BORDER, borderWidth: 0.6 });
    this.page.drawText(clean(title), { x: MARGIN + 8, y: this.y - 13, size: 10, font: this.bold, color: BLUE });
    this.y -= 32;
  }

  fields(rows: Array<[string, string]>) {
    for (const [label, value] of rows) this.field(label, value);
  }

  field(label: string, value: string) {
    this.ensureSpace(30);
    const labelWidth = 156;
    this.page.drawText(clean(label), { x: MARGIN, y: this.y, size: 8.5, font: this.bold, color: MUTED });
    const lines = wrap(clean(value || "-"), this.regular, 9, CONTENT_WIDTH - labelWidth);
    lines.forEach((line, index) => this.page.drawText(line, { x: MARGIN + labelWidth, y: this.y - index * 11, size: 9, font: this.regular, color: TEXT }));
    const height = Math.max(18, lines.length * 11 + 5);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - height + 6 }, end: { x: PAGE_WIDTH - MARGIN, y: this.y - height + 6 }, color: BORDER, thickness: 0.4 });
    this.y -= height;
  }

  paragraph(value: string) {
    const lines = wrap(clean(value), this.regular, 9.5, CONTENT_WIDTH);
    for (const line of lines) {
      this.ensureSpace(16);
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 9.5, font: this.regular, color: TEXT });
      this.y -= 13;
    }
    this.y -= 5;
  }

  inventory(items: TransferPdfItem[]) {
    items.forEach((item, index) => {
      const references = item.dossierReferences.join(", ") || "Aucune référence";
      const value = `${index + 1}. ${item.cartonCode} - ${item.cartonLabel || "Sans libellé"} - ${item.dossierCount} dossier${item.dossierCount > 1 ? "s" : ""} - ${references}`;
      const lines = wrap(clean(value), this.regular, 8.5, CONTENT_WIDTH - 16);
      this.ensureSpace(lines.length * 11 + 12);
      if (index % 2 === 0) this.page.drawRectangle({ x: MARGIN, y: this.y - lines.length * 11 - 3, width: CONTENT_WIDTH, height: lines.length * 11 + 8, color: SURFACE });
      lines.forEach((line, lineIndex) => this.page.drawText(line, { x: MARGIN + 8, y: this.y - lineIndex * 11, size: 8.5, font: this.regular, color: TEXT }));
      this.y -= lines.length * 11 + 9;
    });
    this.y -= 4;
  }

  async signature(signature: TransferPdfSignature) {
    this.ensureSpace(112);
    const top = this.y;
    this.page.drawRectangle({ x: MARGIN, y: top - 96, width: CONTENT_WIDTH, height: 102, borderColor: BORDER, borderWidth: 0.7 });
    this.page.drawText(clean(signature.label), { x: MARGIN + 8, y: top - 12, size: 9, font: this.bold, color: TEXT });
    if (signature.data?.startsWith("data:image/png;base64,")) {
      try {
        const image = await this.doc.embedPng(signature.data.split(",")[1]);
        const scale = Math.min(130 / image.width, 45 / image.height, 1);
        this.page.drawImage(image, { x: MARGIN + 8, y: top - 67, width: image.width * scale, height: image.height * scale });
      } catch {
        this.page.drawText("Signature numérique enregistrée", { x: MARGIN + 8, y: top - 42, size: 8.5, font: this.regular, color: MUTED });
      }
    } else {
      this.page.drawText("Signature à compléter", { x: MARGIN + 8, y: top - 42, size: 8.5, font: this.regular, color: MUTED });
    }
    this.page.drawText(clean(signature.name || "Nom à compléter"), { x: MARGIN + 180, y: top - 36, size: 9, font: this.bold, color: TEXT });
    this.page.drawText(clean(signature.title || "Fonction à compléter"), { x: MARGIN + 180, y: top - 51, size: 8.5, font: this.regular, color: MUTED });
    this.page.drawText(signature.signedAt ? `Signé le ${formatDateTime(signature.signedAt)}` : "Date à compléter", { x: MARGIN + 180, y: top - 66, size: 8.5, font: this.regular, color: MUTED });
    this.y -= 112;
  }

  footerNote(value: string) {
    this.ensureSpace(50);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 30, width: CONTENT_WIDTH, height: 38, color: rgb(0.94, 0.98, 0.97), borderColor: GREEN, borderWidth: 0.7 });
    const lines = wrap(clean(value), this.regular, 8.5, CONTENT_WIDTH - 16);
    lines.slice(0, 3).forEach((line, index) => this.page.drawText(line, { x: MARGIN + 8, y: this.y - 8 - index * 10, size: 8.5, font: this.regular, color: TEXT }));
    this.y -= 48;
  }

  async save() {
    const pages = this.doc.getPages();
    pages.forEach((page, index) => {
      page.drawText(`${BRAND.documentFooter} - Page ${index + 1}/${pages.length}`, { x: MARGIN, y: 20, size: 7.5, font: this.regular, color: MUTED });
    });
    return this.doc.save();
  }

  private ensureSpace(height: number) {
    if (this.y - height >= 40) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.page.drawText(`${BRAND.documentFooter} - suite`, { x: MARGIN, y: PAGE_HEIGHT - 35, size: 9, font: this.bold, color: BLUE });
    this.page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - 43 }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - 43 }, color: BLUE, thickness: 1 });
    this.y = PAGE_HEIGHT - 62;
  }
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || current.length === 0) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function clean(value: string) {
  return value
    .replaceAll("’", "'")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("•", "-")
    .replaceAll("…", "...")
    .replaceAll(" ", " ");
}

function sumDossiers(items: TransferPdfItem[]) {
  return items.reduce((sum, item) => sum + item.dossierCount, 0);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" }).format(value);
}
