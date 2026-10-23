import { describe, expect, test } from "vitest";
import { parsePreparationSearch, preparationInputSchema } from "@/lib/validation/preparation";

describe("preparationInputSchema", () => {
  test("accepte et nettoie les informations métier de préparation", () => {
    const result = preparationInputSchema.parse({
      pieceBreakdown: [
        { typePiece: "1", nombrePieces: 3, nombrePages: 12 },
        { typePiece: "new:Plan de lotissement", nombrePieces: 5, nombrePages: 30 },
      ],
      autresPieces: "  Procès-verbal  ",
      observationsPreparation: "  Agrafes retirées et ordre vérifié.  ",
    });

    expect(result.autresPieces).toBe("Procès-verbal");
    expect(result.observationsPreparation).toBe("Agrafes retirées et ordre vérifié.");
  });

  test("refuse les quantités incohérentes", () => {
    expect(preparationInputSchema.safeParse({ pieceBreakdown: [] }).success).toBe(false);
    expect(preparationInputSchema.safeParse({
      pieceBreakdown: [{ typePiece: "1", nombrePieces: 3, nombrePages: 2 }],
    }).success).toBe(false);
  });

  test("refuse un type déclaré deux fois", () => {
    expect(preparationInputSchema.safeParse({
      pieceBreakdown: [
        { typePiece: "1", nombrePieces: 1, nombrePages: 1 },
        { typePiece: "1", nombrePieces: 2, nombrePages: 4 },
      ],
    }).success).toBe(false);
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
