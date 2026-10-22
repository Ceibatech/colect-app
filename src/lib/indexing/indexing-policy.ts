import { canonicalizeCommuneLabel, canonicalizeLotissementLabel, expectedCommuneForLotissement, localityMatchKey } from "@/lib/utils/locality-normalization";
import type { ExtractedIndexValue, IndexingFieldDefinition } from "@/lib/indexing/indexing-utils";

export type IndexingDecision = "INDEXE" | "DEUXIEME_LECTURE" | "A_REQUALIFIER";

export interface IndexingThresholds {
  automatic: number;
  secondPass: number;
}

export function indexingThresholds(): IndexingThresholds {
  const automatic = Number(process.env.AUTO_INDEX_ACCEPT_THRESHOLD ?? "92");
  const secondPass = Number(process.env.AUTO_INDEX_SECOND_PASS_THRESHOLD ?? "75");
  return {
    automatic: Number.isFinite(automatic) ? Math.min(100, Math.max(80, automatic)) : 92,
    secondPass: Number.isFinite(secondPass) ? Math.min(95, Math.max(40, secondPass)) : 75,
  };
}

export function harmonizeIndexValue(key: string, value: string): string {
  if (key === "commune") return canonicalizeCommuneLabel(value);
  if (key === "lotissement") return canonicalizeLotissementLabel(value);
  return value.trim().replace(/\s+/g, " ");
}

export function validateIndexingRules(
  values: ExtractedIndexValue[],
  fields: IndexingFieldDefinition[],
): string[] {
  const byKey = new Map(values.map((value) => [value.key, value.value.trim()]));
  const issues = fields
    .filter((field) => field.isRequired && !byKey.get(field.key))
    .map((field) => `Champ requis absent : ${field.label}`);

  const commune = byKey.get("commune");
  const lotissement = byKey.get("lotissement");
  if (commune && lotissement) {
    const expected = expectedCommuneForLotissement(lotissement);
    if (expected && localityMatchKey(expected) !== localityMatchKey(canonicalizeCommuneLabel(commune))) {
      issues.push(`Localité incohérente : ${lotissement} doit être rattaché à ${expected}`);
    }
  }
  return issues;
}

export function decideAutomaticIndexing(input: {
  confidence: number;
  analysisPass: "PRINCIPALE" | "SECONDE_LECTURE";
  issues: string[];
  thresholds?: IndexingThresholds;
}): IndexingDecision {
  const thresholds = input.thresholds ?? indexingThresholds();
  if (input.issues.length === 0 && input.confidence >= thresholds.automatic) return "INDEXE";
  if (input.analysisPass === "PRINCIPALE" && input.confidence >= thresholds.secondPass) {
    return "DEUXIEME_LECTURE";
  }
  return "A_REQUALIFIER";
}
