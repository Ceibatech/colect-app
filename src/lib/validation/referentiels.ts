import { z } from "zod";

/** CRUD administration des référentiels (Phase 15+, §12/§60). */

export const communeSchema = z.object({
  code: z.string().min(1, "Le code est requis").max(20),
  nom: z.string().min(1, "Le nom est requis").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
});
export type CommuneInput = z.infer<typeof communeSchema>;

export const lotissementSchema = z.object({
  communeId: z.coerce.number({ message: "La commune est requise" }).int().positive("La commune est requise"),
  code: z.string().min(1, "Le code est requis").max(20),
  nom: z.string().min(1, "Le nom est requis").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
});
export type LotissementInput = z.infer<typeof lotissementSchema>;

export const natureDossierSchema = z.object({
  code: z.string().min(1, "Le code est requis").max(20),
  libelle: z.string().min(1, "Le libellé est requis").max(150),
  description: z.string().max(1000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
});
export type NatureDossierInput = z.infer<typeof natureDossierSchema>;
