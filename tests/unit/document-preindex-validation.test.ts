import { describe, expect, it } from "vitest";
import { documentPreindexSchema } from "@/lib/validation/document-preindex";

describe("document pre-index validation", () => {
  it("accepts an incomplete draft", () => {
    const result = documentPreindexSchema.safeParse({
      titreIndexation: "",
      referenceIndexation: null,
      dateDocument: null,
      nombrePages: null,
      typePieceId: null,
      preIndexNotes: "Scan à reprendre.",
      ready: false,
    });

    expect(result.success).toBe(true);
  });

  it("requires title, document type and page count when marked ready", () => {
    const result = documentPreindexSchema.safeParse({
      titreIndexation: "",
      nombrePages: null,
      typePieceId: null,
      ready: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["titreIndexation", "typePieceId", "nombrePages"]),
      );
    }
  });

  it("accepts a complete document ready for indexation", () => {
    const result = documentPreindexSchema.safeParse({
      titreIndexation: "Titre foncier 10245",
      referenceIndexation: "TF-10245",
      dateDocument: "2026-10-21",
      nombrePages: 12,
      typePieceId: 3,
      preIndexNotes: "Scan lisible.",
      ready: true,
    });

    expect(result.success).toBe(true);
  });
});
