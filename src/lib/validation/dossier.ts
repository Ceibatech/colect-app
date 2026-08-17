import { z } from "zod";

/**
 * Liste fermée des directions/services pouvant être concernés par un
 * dossier (remplace l'ancien champ libre "N° DDU"). "AUTRES" n'est pas une
 * valeur métier réelle : c'est un choix d'interface qui bascule le champ en
 * saisie libre (cf. StepIdentification.tsx) — jamais stockée telle quelle.
 */
export const DIRECTION_SERVICE_OPTIONS = [
  "GUF",
  "DDU",
  "DUDU",
  "DGUF",
  "DTC",
  "GUPCCU",
  "AGEF",
  "SDA",
  "SCPA",
  "SBICU",
  "DGCMA",
  "DEMA",
  "DCM",
  "DMISSA",
  "DGLCV",
  "DICAF",
  "DGLPI",
  "DCCV",
  "SALA",
  "DARRU",
  "ANAH",
  "SONAPIE",
  "DAJC",
] as const;

/** État physique constaté du carton / du dossier à la collecte (Phase 15+). */
export const ETAT_CONSERVATION_OPTIONS = [
  { value: "BON_ETAT", label: "Bon état" },
  { value: "DEGRADE", label: "Dégradé" },
] as const;

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
  // Direction/Service concerné(e) — valeur de DIRECTION_SERVICE_OPTIONS ou
  // texte libre si "Autres" est choisi à la saisie (pas de contrainte
  // z.enum ici pour ne pas bloquer ce cas).
  numeroDdu: z.string().max(50).optional().or(z.literal("")),
  numeroDirectionService: z.string().max(50).optional().or(z.literal("")),
  referenceClassement: z.string().max(150).optional().or(z.literal("")),
  // État physique du carton constaté à la collecte — description uniquement
  // affichée/utile si DEGRADE (cf. StepIdentification.tsx), jamais imposée
  // ici : un carton en bon état n'a rien à décrire.
  etatCarton: z.enum(["BON_ETAT", "DEGRADE"]).optional(),
  etatCartonDescription: z.string().max(1000).optional().or(z.literal("")),

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
  // Saisie libre (Phase 15+, remplace le Select dépendant de la commune) :
  // le référentiel `lotissements` n'est pas systématiquement pré-rempli
  // pour chaque commune, ce qui bloquait la saisie. Résolu côté serveur
  // (find-or-create scopé à la commune) dans dossier-service.ts — la
  // colonne `lotissementId` (FK) est inchangée et continue d'alimenter
  // dashboards/exports/filtres sans changement.
  lotissementNom: z.string().max(150).optional().or(z.literal("")),

  // ÉTAPE 3 — Dossier
  natureDossierId: z.coerce.number().int().positive().optional(),
  // Saisie libre si "Autres" est choisi (cf. StepDossier.tsx) — résolue
  // côté serveur vers une fiche `natures_dossier` réelle (existante ou
  // créée à la volée), comme pour le Lotissement. `natureDossierId` reste
  // vide tant que "Autres" est sélectionné ; l'un ou l'autre doit être
  // renseigné à la soumission (voir le .refine ci-dessous).
  natureDossierAutre: z.string().max(150).optional().or(z.literal("")),
  // État physique du dossier constaté à la collecte, même principe que
  // l'état du carton ci-dessus.
  etatDossier: z.enum(["BON_ETAT", "DEGRADE"]).optional(),
  etatDossierDescription: z.string().max(1000).optional().or(z.literal("")),

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
export const dossierSubmitSchema = dossierFormSchema
  .extend({
    communeId: z.coerce.number({ message: "La commune est requise" }).int().positive("La commune est requise"),
    lotissementNom: z.string().min(1, "Le lotissement est requis").max(150),
    nom: z.string().min(1, "Le nom du titulaire est requis").max(150),
    prenoms: z.string().min(1, "Le(s) prénom(s) du titulaire sont requis").max(150),
  })
  // natureDossierId (liste fermée) OU natureDossierAutre (saisie "Autres")
  // — l'un des deux est requis, jamais les deux à la fois côté UI mais le
  // serveur ne fait confiance à aucun des deux isolément (dossier-service.ts
  // revérifie et résout la valeur finale).
  .refine((data) => !!data.natureDossierId || !!data.natureDossierAutre?.trim(), {
    message: "La nature de dossier est requise",
    path: ["natureDossierId"],
  });

export const DOSSIER_STEPS = [
  { id: 1, title: "Identification", fields: ["operateurId", "libelleCarton", "codeBarres", "numeroGuichet", "numeroDdu", "numeroDirectionService", "referenceClassement", "etatCarton", "etatCartonDescription"] },
  { id: 2, title: "Informations foncières", fields: ["numeroIlot", "numeroLot", "superficie", "numeroTitreFoncier", "communeId", "lotissementNom"] },
  { id: 3, title: "Dossier", fields: ["natureDossierId", "natureDossierAutre", "etatDossier", "etatDossierDescription"] },
  { id: 4, title: "Titulaire", fields: ["nom", "prenoms", "adresse", "telephone", "email"] },
  { id: 5, title: "Contact", fields: ["personneContact", "mobile"] },
  { id: 6, title: "Suivi", fields: ["nombrePages", "observations"] },
  { id: 7, title: "Récapitulatif", fields: [] },
] as const satisfies ReadonlyArray<{ id: number; title: string; fields: readonly (keyof DossierFormValues)[] }>;
