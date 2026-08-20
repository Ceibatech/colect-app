import { z } from "zod";

const statutCollecteEnum = z.enum(["BROUILLON", "SOUMIS"]);
const statutValidationEnum = z.enum(["EN_ATTENTE", "EN_CONTROLE", "VALIDE", "REJETE"]);
const statutTermineEnum = z.enum(["EN_ATTENTE", "EN_COURS", "A_VALIDER", "TERMINE", "REJETE"]);
const sortEnum = z.enum(["createdAt", "reference", "nom", "commune"]);
const dirEnum = z.enum(["asc", "desc"]);

/** Parse et valide les `searchParams` de /dossiers — jamais de confiance dans une URL. */
export const dossierSearchParamsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  commune: z.coerce.number().int().positive().optional(),
  lotissement: z.coerce.number().int().positive().optional(),
  nature: z.coerce.number().int().positive().optional(),
  operateur: z.coerce.number().int().positive().optional(),
  statutCollecte: statutCollecteEnum.optional(),
  statutValidation: statutValidationEnum.optional(),
  statutNumerisation: statutTermineEnum.optional(),
  statutIndexation: statutTermineEnum.optional(),
  statutArchivage: statutTermineEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  sort: sortEnum.default("createdAt"),
  dir: dirEnum.default("desc"),
});

export type DossierSearchParams = z.infer<typeof dossierSearchParamsSchema>;

/** Convertit des `searchParams` bruts (chaînes ou tableaux) en objet exploitable. */
export function parseDossierSearchParams(raw: Record<string, string | string[] | undefined>): DossierSearchParams {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = dossierSearchParamsSchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  // Entrée invalide (URL trafiquée) -> paramètres par défaut plutôt qu'une erreur 500.
  return dossierSearchParamsSchema.parse({});
}
