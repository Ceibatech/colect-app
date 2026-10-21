import { z } from "zod";

const optionalText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional().transform((value) => value || null);

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de document invalide."), z.null()])
  .optional()
  .transform((value) => value || null);

export const documentPreindexSchema = z
  .object({
    titreIndexation: optionalText(191),
    referenceIndexation: optionalText(191),
    dateDocument: optionalDate,
    nombrePages: z.number().int().positive("Le nombre de pages doit être positif.").max(100_000).nullable().optional(),
    typePieceId: z.number().int().positive().nullable().optional(),
    preIndexNotes: optionalText(2_000),
    ready: z.boolean(),
  })
  .superRefine((value, context) => {
    if (!value.ready) return;
    if (!value.titreIndexation) {
      context.addIssue({ code: "custom", path: ["titreIndexation"], message: "Le titre est requis pour déclarer le document prêt." });
    }
    if (!value.typePieceId) {
      context.addIssue({ code: "custom", path: ["typePieceId"], message: "Le type de pièce est requis pour déclarer le document prêt." });
    }
    if (!value.nombrePages) {
      context.addIssue({ code: "custom", path: ["nombrePages"], message: "Le nombre de pages est requis pour déclarer le document prêt." });
    }
  });

export type DocumentPreindexInput = z.infer<typeof documentPreindexSchema>;
