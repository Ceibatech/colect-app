import { normalizeTypePieceText } from "@/lib/utils/type-piece-normalization";

export interface IndexingFieldDefinition {
  id: number;
  key: string;
  label: string;
  aliases: unknown;
  dataType: "TEXT" | "DATE" | "NUMBER" | "IDENTIFIER";
  isRequired: boolean;
  isSearchable: boolean;
}

export interface ExtractedIndexValue {
  fieldId: number;
  key: string;
  value: string;
  rawValue: string;
  confidence: number;
  source: "OCR" | "DOSSIER";
}

export interface DossierIndexContext {
  reference: string;
  site?: string | null;
  entrepot?: string | null;
  commune?: string | null;
  lotissement?: string | null;
  natureDossier?: string | null;
  titulaire?: string | null;
  numeroLot?: string | null;
  numeroIlot?: string | null;
  numeroTitreFoncier?: string | null;
  directionService?: string | null;
  codeBarres?: string | null;
}

function aliasesOf(field: IndexingFieldDefinition): string[] {
  const configured = Array.isArray(field.aliases)
    ? field.aliases.filter((value): value is string => typeof value === "string")
    : [];
  return Array.from(new Set([field.label, ...configured].map((value) => value.trim()).filter(Boolean)));
}

function normalizeValue(rawValue: string, dataType: IndexingFieldDefinition["dataType"]): string {
  const compact = rawValue.replace(/\s+/g, " ").replace(/^[\s:;=\-–—]+|[\s;]+$/g, "").trim();
  if (!compact) return "";

  if (dataType === "DATE") {
    const match = compact.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
    if (match) {
      const iso = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      const parsed = new Date(`${iso}T00:00:00.000Z`);
      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getUTCFullYear() === Number(match[3]) &&
        parsed.getUTCMonth() + 1 === Number(match[2]) &&
        parsed.getUTCDate() === Number(match[1])
      ) return iso;
    }
  }
  if (dataType === "NUMBER") {
    const match = compact.replace(/\s/g, "").match(/-?\d+(?:[,.]\d+)?/);
    if (match) return match[0].replace(",", ".");
  }
  if (dataType === "IDENTIFIER") return compact.toLocaleUpperCase("fr");
  return compact;
}

function lineCandidate(line: string, alias: string): { rawValue: string; confidence: number } | null {
  const normalizedLine = normalizeTypePieceText(line);
  const normalizedAlias = normalizeTypePieceText(alias);
  if (!normalizedLine || !normalizedAlias) return null;

  const separators = [":", "=", "–", "—"];
  for (const separator of separators) {
    const index = line.indexOf(separator);
    if (index < 0) continue;
    const label = normalizeTypePieceText(line.slice(0, index));
    if (label === normalizedAlias || label.endsWith(` ${normalizedAlias}`)) {
      return { rawValue: line.slice(index + 1), confidence: 92 };
    }
  }

  if (normalizedLine.startsWith(`${normalizedAlias} `)) {
    const tokensToSkip = normalizedAlias.split(" ").length;
    const originalTokens = line.trim().split(/\s+/);
    return { rawValue: originalTokens.slice(tokensToSkip).join(" "), confidence: 78 };
  }
  return null;
}

/** Extraction déterministe de paires libellé/valeur. L'OCR propose, l'agent valide. */
export function extractConfiguredValues(
  text: string,
  fields: IndexingFieldDefinition[],
): ExtractedIndexValue[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20_000);

  const values: ExtractedIndexValue[] = [];
  for (const field of fields) {
    let best: ExtractedIndexValue | null = null;
    for (const alias of aliasesOf(field).sort((a, b) => b.length - a.length)) {
      for (const line of lines) {
        const candidate = lineCandidate(line, alias);
        if (!candidate) continue;
        const value = normalizeValue(candidate.rawValue, field.dataType);
        if (!value || value.length > 500) continue;
        const next = {
          fieldId: field.id,
          key: field.key,
          value,
          rawValue: candidate.rawValue.trim(),
          confidence: candidate.confidence,
          source: "OCR" as const,
        };
        if (!best || next.confidence > best.confidence) best = next;
      }
    }
    if (best) values.push(best);
  }
  return values;
}

const DOSSIER_FIELD_VALUES: Record<string, keyof DossierIndexContext> = {
  business_reference: "reference",
  titulaire: "titulaire",
  commune: "commune",
  lotissement: "lotissement",
  numero_lot: "numeroLot",
  numero_ilot: "numeroIlot",
  titre_foncier: "numeroTitreFoncier",
  direction_service: "directionService",
  code_barres: "codeBarres",
  nature_dossier: "natureDossier",
};

/** Complète les valeurs OCR absentes avec les données structurées, plus fiables, du dossier. */
export function mergeDossierValues(
  extracted: ExtractedIndexValue[],
  fields: IndexingFieldDefinition[],
  dossier: DossierIndexContext,
): ExtractedIndexValue[] {
  const byField = new Map(extracted.map((value) => [value.fieldId, value]));
  for (const field of fields) {
    if (byField.has(field.id)) continue;
    const dossierKey = DOSSIER_FIELD_VALUES[field.key];
    const rawValue = dossierKey ? dossier[dossierKey] : null;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!value) continue;
    byField.set(field.id, {
      fieldId: field.id,
      key: field.key,
      value,
      rawValue: value,
      confidence: 100,
      source: "DOSSIER",
    });
  }
  return [...byField.values()];
}

function pathSegment(value: string | null | undefined, fallback: string): string {
  const sanitized = (value ?? "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .-]+|[ .-]+$/g, "")
    .slice(0, 120)
    .trim();
  return sanitized || fallback;
}

export function buildClassificationPath(dossier: DossierIndexContext): string {
  return [
    pathSegment(dossier.site, "Site-non-renseigne"),
    pathSegment(dossier.entrepot, "Espace-non-renseigne"),
    pathSegment(dossier.commune, "Commune-non-renseignee"),
    pathSegment(dossier.natureDossier, "Nature-non-renseignee"),
    pathSegment(dossier.reference, "Dossier"),
  ].join("/");
}

export function buildDocumentSearchText(input: {
  extractedText?: string | null;
  originalName: string;
  title?: string | null;
  reference?: string | null;
  typePiece?: string | null;
  classificationPath?: string | null;
  values: Array<{ value: string; searchable?: boolean }>;
}): string {
  return [
    input.originalName,
    input.title,
    input.reference,
    input.typePiece,
    input.classificationPath,
    ...input.values.filter((value) => value.searchable !== false).map((value) => value.value),
    input.extractedText,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .slice(0, 4_000_000);
}
