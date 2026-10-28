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
/** Îlot et lot : lettres, chiffres, espaces, / et - (ex. 12, 12 BIS, A-3). */
const LOT_PATTERN = /^(?:[\p{L}\p{N}][\p{L}\p{N} /-]*)?$/u;
/** Champ numérique exigé : vide → « requis », sinon nombre contrôlé. */
const requiredNumber = (message: string, schema: z.ZodNumber) =>
  z.preprocess((value) => (value === "" || value === null ? undefined : value), z.coerce.number({ message }).pipe(schema).optional())
    .refine((value) => value !== undefined, { message });

export const dossierFormSchema = z.object({
  // ÉTAPE 1 — Site
  // Site d'archivage physique (Phase 16+) — référentiel géré depuis
  // /administration/sites. Optionnel pour l'instant : le référentiel est
  // vide à l'introduction de ce champ (aucun site n'existe encore), le
  // rendre obligatoire à la soumission bloquerait toute la Collecte tant
  // qu'un administrateur n'a pas créé au moins un site.
  siteId: z.coerce.number().int().positive().optional(),
  // Entrepôt (Phase 17+) : précision en cascade sous le site choisi, même
  // raisonnement d'optionalité que siteId ci-dessus.
  entrepotId: z.coerce.number().int().positive().optional(),

  // ÉTAPE 2 — Identification
  operateurId: z.coerce.number().int().positive().optional(),
  libelleCarton: z.string().max(255).optional().or(z.literal("")),
  // Question d'inventaire : le dossier rejoint un carton déjà commencé
  // (désigné par sa cote) ou ouvre un nouveau carton.
  modeCarton: z.enum(["EXISTANT", "NOUVEAU"]).optional(),
  // Rubrique du référentiel de classement MULCV (2010 = Dossiers ACD) : ouvre
  // la cote d'un nouveau carton.
  classement: z.string().regex(/^\d{4}$/, "Rubrique de classement invalide").optional().or(z.literal("")),
  // Cote du carton (2010-KOU-0001) scannée ou saisie : range le dossier dans ce
  // carton existant, quel que soit le libellé. Vide : carton reconnu par son
  // libellé, ou nouveau carton.
  cartonCote: z.string().trim().max(50).optional().or(z.literal("")),
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

  // ÉTAPE 3 — Informations foncières
  numeroIlot: z.string().max(50).optional().or(z.literal("")),
  numeroLot: z.string().max(50).optional().or(z.literal("")),
  superficie: z.coerce
    .number({ message: "La superficie doit être un nombre" })
    .positive("La superficie doit être positive")
    .max(1_000_000, "Superficie invraisemblable")
    .optional()
    .or(z.literal("")),
  numeroTitreFoncier: z.string().max(100).optional().or(z.literal("")),
  sansTitreFoncier: z.boolean().optional(),
  anneeActe: z.coerce
    .number({ message: "L'année doit être un nombre" })
    .int("L'année doit être un nombre entier")
    .min(1900, "Année invraisemblable")
    .max(new Date().getFullYear(), "L'année ne peut pas être dans le futur")
    .optional()
    .or(z.literal("")),
  communeId: z.coerce.number().int().positive().optional(),
  // L'opérateur peut sélectionner une valeur connue ou proposer une nouvelle
  // localité. Le serveur harmonise les alias avant de réutiliser/créer la fiche.
  lotissementNom: z.string().max(150).optional().or(z.literal("")),

  // ÉTAPE 4 — Dossier
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

  // ÉTAPE 5 — Titulaire
  nom: z.string().max(150).optional().or(z.literal("")),
  prenoms: z.string().max(150).optional().or(z.literal("")),
  adresse: z.string().max(500).optional().or(z.literal("")),
  telephone: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email("E-mail invalide").max(150).optional().or(z.literal("")),

  // ÉTAPE 6 — Contact
  personneContact: z.string().max(150).optional().or(z.literal("")),
  mobile: z.string().max(30).optional().or(z.literal("")),

  // ÉTAPE 7 — Suivi
  // `nombrePages` (Phase 20+) et `autresPieces` (Phase 21+) retirés d'ici —
  // déplacés vers l'étape "Préparation" (cf. TypesPiecesField.tsx/
  // PreparationActions dans WorkflowActions.tsx et resolveTypesPieceIds()
  // dans workflow-service.ts).
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
    // Référentiel MULCV, série 2000 (actes du foncier) : métadonnées exigées.
    numeroIlot: z.string().trim().min(1, "Le n° d'îlot est requis").max(50).regex(LOT_PATTERN, "N° d'îlot : lettres, chiffres, espaces, / ou - seulement"),
    numeroLot: z.string().trim().min(1, "Le n° de lot est requis").max(50).regex(LOT_PATTERN, "N° de lot : lettres, chiffres, espaces, / ou - seulement"),
    superficie: requiredNumber("La superficie est requise", z.number().positive("La superficie doit être positive").max(1_000_000, "Superficie invraisemblable")),
    anneeActe: requiredNumber("L'année de l'acte est requise", z.number().int("L'année doit être un nombre entier").min(1900, "Année invraisemblable").max(new Date().getFullYear(), "L'année ne peut pas être dans le futur")),
  })
  // Titre foncier : renseigné, ou absence déclarée explicitement.
  .refine((data) => !!data.numeroTitreFoncier?.trim() || data.sansTitreFoncier === true, {
    message: "Saisissez le n° de titre foncier, ou cochez « Pas de titre foncier ».",
    path: ["numeroTitreFoncier"],
  })
  // natureDossierId (liste fermée) OU natureDossierAutre (saisie "Autres")
  // — l'un des deux est requis, jamais les deux à la fois côté UI mais le
  // serveur ne fait confiance à aucun des deux isolément (dossier-service.ts
  // revérifie et résout la valeur finale).
  // La nature vient de la rubrique du carton (fixée par le serveur) ; sinon, liste ou « Autres ».
  .refine((data) => !!data.modeCarton || !!data.natureDossierId || !!data.natureDossierAutre?.trim(), {
    message: "La nature de dossier est requise",
    path: ["natureDossierId"],
  });

export const DOSSIER_STEPS = [
  { id: 1, title: "Carton et site", fields: ["modeCarton", "cartonCote", "siteId", "entrepotId", "classement", "libelleCarton"] },
  { id: 2, title: "Identification", fields: ["codeBarres", "numeroGuichet", "numeroDdu", "numeroDirectionService", "referenceClassement", "etatCarton", "etatCartonDescription"] },
  { id: 3, title: "Informations foncières", fields: ["numeroIlot", "numeroLot", "superficie", "numeroTitreFoncier", "sansTitreFoncier", "anneeActe", "communeId", "lotissementNom"] },
  { id: 4, title: "Dossier", fields: ["natureDossierId", "natureDossierAutre", "etatDossier", "etatDossierDescription"] },
  { id: 5, title: "Titulaire", fields: ["nom", "prenoms", "adresse", "telephone", "email"] },
  { id: 6, title: "Contact", fields: ["personneContact", "mobile"] },
  { id: 7, title: "Suivi", fields: ["observations"] },
  { id: 8, title: "Récapitulatif", fields: [] },
] as const satisfies ReadonlyArray<{ id: number; title: string; fields: readonly (keyof DossierFormValues)[] }>;
