import { z } from "zod";

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const preparationPieceLineSchema = z.object({
  typePiece: z.string().trim().min(1).max(180),
  nombrePieces: z.number().int().min(1).max(100_000),
  nombrePages: z.number().int().min(1).max(1_000_000),
}).superRefine((line, ctx) => {
  if (line.nombrePages < line.nombrePieces) {
    ctx.addIssue({
      code: "custom",
      path: ["nombrePages"],
      message: "Le nombre de pages ne peut pas être inférieur au nombre de pièces.",
    });
  }
});

export const preparationInputSchema = z.object({
  pieceBreakdown: z.array(preparationPieceLineSchema).min(1, "Ajoutez au moins un type de pièce.").max(100),
  autresPieces: optionalTrimmedText(2_000),
  observationsPreparation: optionalTrimmedText(2_000),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  data.pieceBreakdown.forEach((line, index) => {
    const key = line.typePiece.toLocaleLowerCase("fr");
    if (seen.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["pieceBreakdown", index, "typePiece"],
        message: "Un type de pièce ne peut apparaître qu'une seule fois.",
      });
    }
    seen.add(key);
  });
});

export type PreparationInput = z.infer<typeof preparationInputSchema>;

export const preparationSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  carton: z.string().trim().max(240).optional(),
  statut: z.enum(["A_TRAITER", "A_VALIDER", "TERMINE", "REJETE", "TOUS"]).default("A_TRAITER"),
  page: z.coerce.number().int().positive().default(1),
});

export type PreparationSearch = z.infer<typeof preparationSearchSchema>;

export function parsePreparationSearch(raw: Record<string, string | string[] | undefined>): PreparationSearch {
  const q = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const statut = Array.isArray(raw.statut) ? raw.statut[0] : raw.statut;
  const carton = Array.isArray(raw.carton) ? raw.carton[0] : raw.carton;
  const page = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const parsed = preparationSearchSchema.safeParse({
    q: q || undefined,
    carton: carton || undefined,
    statut: statut || undefined,
    page: page || undefined,
  });
  return parsed.success ? parsed.data : preparationSearchSchema.parse({});
}
