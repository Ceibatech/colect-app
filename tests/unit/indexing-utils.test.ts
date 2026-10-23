import { describe, expect, it } from "vitest";
import {
  buildClassificationPath,
  buildDocumentSearchText,
  extractConfiguredValues,
  mergeDossierValues,
  type IndexingFieldDefinition,
} from "@/lib/indexing/indexing-utils";

const fields: IndexingFieldDefinition[] = [
  { id: 1, key: "business_reference", label: "Référence métier", aliases: ["Réf", "Numéro de référence"], dataType: "IDENTIFIER", isRequired: false, isSearchable: true },
  { id: 2, key: "document_date", label: "Date du document", aliases: ["Établi le"], dataType: "DATE", isRequired: false, isSearchable: true },
  { id: 3, key: "commune", label: "Commune", aliases: ["Localité"], dataType: "TEXT", isRequired: false, isSearchable: true },
];

describe("document indexing utilities", () => {
  it("extracts configured labels with normalized values", () => {
    const values = extractConfiguredValues(
      "RÉF : tf 0042\nÉtabli le : 2/9/2026\nCommune : PORT-BOUËT",
      fields,
    );
    expect(values.find((value) => value.key === "business_reference")?.value).toBe("TF 0042");
    expect(values.find((value) => value.key === "document_date")?.value).toBe("2026-09-02");
    expect(values.find((value) => value.key === "commune")?.value).toBe("PORT-BOUËT");
  });

  it("fills missing OCR fields from reliable dossier metadata", () => {
    const extracted = extractConfiguredValues("Réf : ABC-9", fields);
    const merged = mergeDossierValues(extracted, fields, {
      reference: "DOS-2026-000001",
      commune: "Koumassi",
    });
    expect(merged.find((value) => value.key === "business_reference")?.source).toBe("OCR");
    expect(merged.find((value) => value.key === "commune")).toMatchObject({ value: "Koumassi", source: "DOSSIER", confidence: 100 });
  });

  it("builds a stable safe classification path", () => {
    expect(buildClassificationPath({
      reference: "DOS-2026-000003",
      site: "Ministère / Plateau",
      entrepot: "Tour D",
      commune: "Marcory",
      natureDossier: "Dossier ACD",
    })).toBe("Ministère - Plateau/Tour D/Marcory/Dossier ACD/DOS-2026-000003");
  });

  it("builds a searchable corpus from OCR and controlled metadata", () => {
    const searchText = buildDocumentSearchText({
      originalName: "scan-01.pdf",
      title: "Arrêté de concession",
      reference: "ACP-88",
      values: [{ value: "Koumassi" }, { value: "secret", searchable: false }],
      extractedText: "Ministère de la Construction",
    });
    expect(searchText).toContain("ACP-88");
    expect(searchText).toContain("Koumassi");
    expect(searchText).toContain("Ministère de la Construction");
    expect(searchText).not.toContain("secret");
  });
});
