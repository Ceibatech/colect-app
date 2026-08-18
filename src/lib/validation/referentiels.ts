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

/**
 * Site d'archivage physique (Phase 16+) — ordre des champs aligné sur la
 * fiche "Informations générales du site" fournie par le métier. Seuls
 * `code` et `nom` sont obligatoires : les autres champs (contact, adresse,
 * date de mise en service...) peuvent être complétés progressivement.
 */
export const siteSchema = z.object({
  code: z.string().min(1, "Le code est requis").max(20),
  nom: z.string().min(1, "Le nom est requis").max(150),
  typeSite: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
  dateMiseEnService: z.string().max(20).optional().or(z.literal("")),
  responsable: z.string().max(150).optional().or(z.literal("")),
  telephone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("E-mail invalide").max(150).optional().or(z.literal("")),
  adresse: z.string().max(500).optional().or(z.literal("")),
  communeId: z.coerce.number().int().positive().optional().or(z.literal("")),
  quartier: z.string().max(150).optional().or(z.literal("")),
  ville: z.string().max(100).optional().or(z.literal("")),
  region: z.string().max(100).optional().or(z.literal("")),
});
export type SiteInput = z.infer<typeof siteSchema>;
