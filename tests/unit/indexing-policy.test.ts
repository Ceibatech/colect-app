import { describe, expect, it } from "vitest";
import { decideAutomaticIndexing, harmonizeIndexValue, validateIndexingRules } from "@/lib/indexing/indexing-policy";
import type { ExtractedIndexValue, IndexingFieldDefinition } from "@/lib/indexing/indexing-utils";

const fields: IndexingFieldDefinition[] = [
  { id: 1, key: "document_title", label: "Titre", aliases: [], dataType: "TEXT", isRequired: true, isSearchable: true },
  { id: 2, key: "commune", label: "Commune", aliases: [], dataType: "TEXT", isRequired: false, isSearchable: true },
  { id: 3, key: "lotissement", label: "Lotissement", aliases: [], dataType: "TEXT", isRequired: false, isSearchable: true },
];

function value(fieldId: number, key: string, content: string): ExtractedIndexValue {
  return { fieldId, key, value: content, rawValue: content, confidence: 95, source: "OCR" };
}

describe("automatic indexing policy", () => {
  it("validates automatically above the threshold when rules are coherent", () => {
    expect(decideAutomaticIndexing({ confidence: 94, analysisPass: "PRINCIPALE", issues: [], thresholds: { automatic: 92, secondPass: 75 } })).toBe("INDEXE");
  });

  it("requests a second AI pass for intermediate confidence", () => {
    expect(decideAutomaticIndexing({ confidence: 84, analysisPass: "PRINCIPALE", issues: [], thresholds: { automatic: 92, secondPass: 75 } })).toBe("DEUXIEME_LECTURE");
  });

  it("routes persistent ambiguity to requalification", () => {
    expect(decideAutomaticIndexing({ confidence: 88, analysisPass: "SECONDE_LECTURE", issues: [], thresholds: { automatic: 92, secondPass: 75 } })).toBe("A_REQUALIFIER");
  });

  it("harmonizes REMBLAI without silently accepting an incoherent commune", () => {
    expect(harmonizeIndexValue("lotissement", "remblai")).toBe("REMBLAIS");
    const issues = validateIndexingRules(
      [value(1, "document_title", "Dossier foncier"), value(2, "commune", "Koumassi"), value(3, "lotissement", "REMBLAI")],
      fields,
    );
    expect(issues).toContain("Localité incohérente : REMBLAI doit être rattaché à Marcory");
  });
});
