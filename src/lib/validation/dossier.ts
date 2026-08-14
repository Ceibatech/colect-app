import { z } from "zod";

/**
 * Schéma "souple" utilisé par React Hook Form pendant la saisie (brouillon
 * inclus) : les formats sont vérifiés mais rien n'est obligatoire, pour ne
 * jamais bloquer un `Enregistrer brouillon`. Les champs obligatoires à la
 * SOUMISSION sont vérifiés séparément par `dossierSubmitSchema` (§40/§41).
 *
 * Note : les <input type="number"> vides envoient `""` (pas `undefined`) via
 * React Hook Form. `.or(z.literal(""))` accepte explicitement ce cas pour un
 * champ numérique optionnel non renseigné (le nettoyage définitif en `null`
 * est fait côté serveur dans dossier-service.ts, qui ne fait jamais
 * confiance à ce que le client envoie).
 */
export const dossierFormSchema = z.object({
  // ÉTAPE 1 — Identification
  operateurId: z.coerce.number().int().positive().optional(),
  libelleCarton: z.string().max(255).optional().or(z.literal("")),
  codeBarres: z.string().max(100).optional().or(z.literal("")),
  numeroGuichet: z.string().max(50).optional().or(z.literal("")),
  numeroDdu: z.string().max(50).optional().or(z.literal("")),
  referenceClassement: z.string().max(150).optional().or(z.literal("")),

  // ÉTAPE 2 — Informations foncières
  numeroIlot: z.string().max(50).optional().or(z.literal("")),
  numeroLot: z.string().max(50).optional().or(z.literal("")),
  superficie: z.coerce
    .number({ message: "La superficie doit être un nombre" })
    .positive("La superficie doit être positive")
    .max(1_000_000, "Superficie invraisemblable")
    .optional()
    .or(z.literal("")),
  numeroTitreFoncier: z.string().max(100).optional().or(z.literal("")),
  communeId: z.coerce.number().int().positive().optional(),
  lotissementId: z.coerce.number().int().positive().optional(),

  // ÉTAPE 3 — Dossier
  natureDossierId: z.coerce.number().int().positive().optional(),

  // ÉTAPE 4 — Titulaire
  nom: z.string().max(150).optional().or(z.literal("")),
  prenoms: z.string().max(150).optional().or(z.literal("")),
  adresse: z.string().max(500).optional().or(z.literal("")),
  telephone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("E-mail invalide").max(150).optional().or(z.literal("")),

  // ÉTAPE 5 — Contact
  personneContact: z.string().max(150).optional().or(z.literal("")),
  mobile: z.string().max(30).optional().or(z.literal("")),

  // ÉTAPE 6 — Suivi
  nombrePages: z.coerce.number().int().positive().max(100_000).optional().or(z.literal("")),
  observations: z.string().max(2000).optional().or(z.literal("")),
});

export type DossierFormValues = z.infer<typeof dossierFormSchema>;

/** Vérification stricte exécutée uniquement au moment de "Soumettre" (§41). */
export const dossierSubmitSchema = dossierFormSchema.extend({
  communeId: z.coerce.number({ message: "La commune est requise" }).int().positive("La commune est requise"),
  lotissementId: z.coerce.number({ message: "Le lotissement est requis" }).int().positive("Le lotissement est requis"),
  natureDossierId: z.coerce
    .number({ message: "La nature de dossier est requise" })
    .int()
    .positive("La nature de dossier est requise"),
  nom: z.string().min(1, "Le nom du titulaire est requis").max(150),
  prenoms: z.string().min(1, "Le(s) prénom(s) du titulaire sont requis").max(150),
});

export const DOSSIER_STEPS = [
  { id: 1, title: "Identification", fields: ["operateurId", "libelleCarton", "codeBarres", "numeroGuichet", "numeroDdu", "referenceClassement"] },
  { id: 2, title: "Informations foncières", fields: ["numeroIlot", "numeroLot", "superficie", "numeroTitreFoncier", "communeId", "lotissementId"] },
  { id: 3, title: "Dossier", fields: ["natureDossierId"] },
  { id: 4, title: "Titulaire", fields: ["nom", "prenoms", "adresse", "telephone", "email"] },
  { id: 5, title: "Contact", fields: ["personneContact", "mobile"] },
  { id: 6, title: "Suivi", fields: ["nombrePages", "observations"] },
  { id: 7, title: "Récapitulatif", fields: [] },
] as const satisfies ReadonlyArray<{ id: number; title: string; fields: readonly (keyof DossierFormValues)[] }>;
