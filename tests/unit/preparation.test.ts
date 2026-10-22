import { describe, expect, test } from "vitest";
import { parsePreparationSearch, preparationInputSchema } from "@/lib/validation/preparation";

describe("preparationInputSchema", () => {
  test("accepte et nettoie les informations métier de préparation", () => {
    const result = preparationInputSchema.parse({
      nombrePieces: 8,
      typesPieces: ["1", "new:Plan de lotissement"],
      autresPieces: "  Procès-verbal  ",
      nombrePages: 42,
      observationsPreparation: "  Agrafes retirées et ordre vérifié.  ",
    });

    expect(result.autresPieces).toBe("Procès-verbal");
    expect(result.observationsPreparation).toBe("Agrafes retirées et ordre vérifié.");
  });

  test("refuse les quantités incohérentes", () => {
    expect(preparationInputSchema.safeParse({ nombrePieces: -1 }).success).toBe(false);
    expect(preparationInputSchema.safeParse({ nombrePages: 0 }).success).toBe(false);
  });
});

describe("parsePreparationSearch", () => {
  test("retombe sur la file à préparer pour une URL invalide", () => {
    expect(parsePreparationSearch({ statut: "INCONNU", page: "-3" })).toEqual({
      statut: "A_TRAITER",
      page: 1,
    });
  });
});
