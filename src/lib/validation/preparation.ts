import { z } from "zod";

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const preparationInputSchema = z.object({
  nombrePieces: z.number().int().min(0).max(100_000).optional(),
  typesPieces: z.array(z.string().trim().min(1).max(180)).max(100).optional(),
  autresPieces: optionalTrimmedText(2_000),
  nombrePages: z.number().int().min(1).max(1_000_000).optional(),
  observationsPreparation: optionalTrimmedText(2_000),
});

export type PreparationInput = z.infer<typeof preparationInputSchema>;

export const preparationSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  statut: z.enum(["A_TRAITER", "A_VALIDER", "TERMINE", "REJETE", "TOUS"]).default("A_TRAITER"),
  page: z.coerce.number().int().positive().default(1),
});

export type PreparationSearch = z.infer<typeof preparationSearchSchema>;

export function parsePreparationSearch(raw: Record<string, string | string[] | undefined>): PreparationSearch {
  const q = Array.isArray(raw.q) ? raw.q[0] : raw.q;
  const statut = Array.isArray(raw.statut) ? raw.statut[0] : raw.statut;
  const page = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const parsed = preparationSearchSchema.safeParse({
    q: q || undefined,
    statut: statut || undefined,
    page: page || undefined,
  });
  return parsed.success ? parsed.data : preparationSearchSchema.parse({});
}
