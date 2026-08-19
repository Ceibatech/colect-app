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
  // Géolocalisation (Phase 17+) — capturée via le bouton "Capturer ma
  // position GPS" (Geolocation API du navigateur), jamais saisie à la main
  // pour lat/lon (mais le champ reste modifiable si besoin de correction).
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  altitude: z.coerce.number().optional().or(z.literal("")),
  precisionGps: z.coerce.number().min(0).optional().or(z.literal("")),
  adresseGps: z.string().max(500).optional().or(z.literal("")),
  pointGps: z.string().max(100).optional().or(z.literal("")),
});
export type SiteInput = z.infer<typeof siteSchema>;

/**
 * Entrepôt (Phase 17+) : subdivision d'un site — "un site peut avoir un ou
 * plusieurs entrepôts". Rattachement obligatoire à un site (contrairement
 * au site lui-même qui n'est pas obligatoirement rattaché à une commune).
 */
export const entrepotSchema = z.object({
  siteId: z.coerce.number({ message: "Le site est requis" }).int().positive("Le site est requis"),
  code: z.string().min(1, "Le code est requis").max(20),
  nom: z.string().min(1, "Le nom est requis").max(150),
  typeEntrepot: z.string().max(100).optional().or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
  isActive: z.coerce.boolean().default(true),
  anneeMiseEnService: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal("")),
  responsable: z.string().max(150).optional().or(z.literal("")),
  telephone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("E-mail invalide").max(150).optional().or(z.literal("")),
  // Dimensions (Phase 17+, "Caractéristiques physiques de l'entrepôt") —
  // déclaratives, saisies une fois en administration.
  surfaceM2: z.coerce.number().min(0).optional().or(z.literal("")),
  longueur: z.coerce.number().min(0).optional().or(z.literal("")),
  largeur: z.coerce.number().min(0).optional().or(z.literal("")),
  hauteurSousPlafond: z.coerce.number().min(0).optional().or(z.literal("")),
  nombreNiveaux: z.coerce.number().int().min(0).optional().or(z.literal("")),
  nombreSalles: z.coerce.number().int().min(0).optional().or(z.literal("")),
  nombreZonesArchivage: z.coerce.number().int().min(0).optional().or(z.literal("")),
  // Capacité — uniquement les champs déclaratifs ; "occupée"/"disponible"/
  // taux sont calculés à la volée, jamais saisis (cf. schema.prisma).
  nombreRayonnages: z.coerce.number().int().min(0).optional().or(z.literal("")),
  nombreTravees: z.coerce.number().int().min(0).optional().or(z.literal("")),
  nombreEtageres: z.coerce.number().int().min(0).optional().or(z.literal("")),
  capaciteCartonsMax: z.coerce.number().int().min(0).optional().or(z.literal("")),
  capaciteBoitesMax: z.coerce.number().int().min(0).optional().or(z.literal("")),
  capaciteTheorique: z.coerce.number().int().min(0).optional().or(z.literal("")),
});
export type EntrepotInput = z.infer<typeof entrepotSchema>;
