import "server-only";
import type { Dossier, AnomalieGravite, AnomalieType } from "@prisma/client";

/**
 * Champs "contrôlés" pour le score qualité (§53) : exactement les champs
 * issus de la fiche CG1020 (voir DATABASE.md §3) — les champs de suivi
 * applicatif (statuts, dates, nombre de pages, observations) n'entrent pas
 * dans le calcul, ce ne sont pas des données saisies sur la fiche.
 *
 * Fonctions pures (pas de "use server" ici) — ce fichier n'exporte pas
 * uniquement des fonctions async, il ne peut donc pas cohabiter dans un
 * module Server Actions (contrainte Next.js). Importé par
 * quality-service.ts.
 */
interface FieldCheck {
  key: keyof Dossier;
  label: string;
  missingGravite: AnomalieGravite;
  validate?: (value: unknown) => boolean;
  invalidGravite?: AnomalieGravite;
  invalidType?: AnomalieType;
}

const PHONE_RE = /^[0-9+()\-.\s]{8,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_CHECKS: FieldCheck[] = [
  { key: "libelleCarton", label: "Libellé du carton", missingGravite: "FAIBLE" },
  { key: "codeBarres", label: "Code-barres", missingGravite: "ELEVEE" },
  { key: "numeroGuichet", label: "N° guichet", missingGravite: "FAIBLE" },
  { key: "numeroDdu", label: "N° DDU", missingGravite: "MOYENNE" },
  { key: "referenceClassement", label: "Référence de classement", missingGravite: "FAIBLE" },
  { key: "numeroIlot", label: "N° îlot", missingGravite: "MOYENNE" },
  { key: "numeroLot", label: "N° lot", missingGravite: "MOYENNE" },
  {
    key: "superficie",
    label: "Superficie",
    missingGravite: "MOYENNE",
    validate: (v) => {
      const n = v === null || v === undefined ? null : Number(v);
      return n !== null && n > 0 && n <= 1_000_000;
    },
    invalidGravite: "MOYENNE",
    invalidType: "INCOHERENCE",
  },
  { key: "numeroTitreFoncier", label: "N° titre foncier", missingGravite: "MOYENNE" },
  { key: "communeId", label: "Commune", missingGravite: "ELEVEE" },
  { key: "lotissementId", label: "Lotissement", missingGravite: "ELEVEE" },
  { key: "natureDossierId", label: "Nature du dossier", missingGravite: "ELEVEE" },
  { key: "nom", label: "Nom", missingGravite: "ELEVEE" },
  { key: "prenoms", label: "Prénoms", missingGravite: "ELEVEE" },
  { key: "adresse", label: "Adresse", missingGravite: "FAIBLE" },
  {
    key: "telephone",
    label: "Téléphone",
    missingGravite: "MOYENNE",
    validate: (v) => typeof v === "string" && PHONE_RE.test(v),
    invalidGravite: "MOYENNE",
    invalidType: "FORMAT_INVALIDE",
  },
  {
    key: "email",
    label: "E-mail",
    missingGravite: "MOYENNE",
    validate: (v) => typeof v === "string" && EMAIL_RE.test(v),
    invalidGravite: "MOYENNE",
    invalidType: "FORMAT_INVALIDE",
  },
  { key: "personneContact", label: "Personne à contacter", missingGravite: "FAIBLE" },
  {
    key: "mobile",
    label: "Mobile",
    missingGravite: "FAIBLE",
    validate: (v) => typeof v === "string" && PHONE_RE.test(v),
    invalidGravite: "MOYENNE",
    invalidType: "FORMAT_INVALIDE",
  },
];

export const QUALITY_FIELD_COUNT = FIELD_CHECKS.length;

export interface FieldIssue {
  champ: string;
  type: AnomalieType;
  gravite: AnomalieGravite;
  description: string;
}

export interface DossierScore {
  totalFields: number;
  validFields: number;
  score: number; // 0-100, arrondi
  issues: FieldIssue[];
}

export const QUALITY_SCORE_SELECT = {
  id: true,
  operateurId: true,
  communeId: true,
  statutValidation: true,
  statutNumerisation: true,
  libelleCarton: true,
  codeBarres: true,
  numeroGuichet: true,
  numeroDdu: true,
  referenceClassement: true,
  numeroIlot: true,
  numeroLot: true,
  superficie: true,
  numeroTitreFoncier: true,
  lotissementId: true,
  natureDossierId: true,
  nom: true,
  prenoms: true,
  adresse: true,
  telephone: true,
  email: true,
  personneContact: true,
  mobile: true,
  _count: { select: { documents: true } },
} as const;

/**
 * Score qualité d'un dossier : champs valides / champs contrôlés × 100
 * (formule §53). Un champ vide compte pour invalide (CHAMP_MANQUANT) ; un
 * champ rempli mais mal formé (e-mail, téléphone, superficie) compte aussi
 * pour invalide (FORMAT_INVALIDE / INCOHERENCE).
 */
export function scoreDossier(
  dossier: Partial<Dossier>,
  options?: { includeDocumentCheck?: boolean; hasDocument?: boolean }
): DossierScore {
  const issues: FieldIssue[] = [];
  let validFields = 0;

  for (const check of FIELD_CHECKS) {
    const value = dossier[check.key];
    const isEmpty = value === null || value === undefined || value === "";

    if (isEmpty) {
      issues.push({
        champ: check.key,
        type: "CHAMP_MANQUANT",
        gravite: check.missingGravite,
        description: `${check.label} non renseigné.`,
      });
      continue;
    }

    if (check.validate && !check.validate(value)) {
      issues.push({
        champ: check.key,
        type: check.invalidType ?? "FORMAT_INVALIDE",
        gravite: check.invalidGravite ?? "MOYENNE",
        description: `${check.label} au format ou à la valeur invalide (${String(value)}).`,
      });
      continue;
    }

    validFields++;
  }

  let totalFields = FIELD_CHECKS.length;
  if (options?.includeDocumentCheck) {
    totalFields += 1;
    if (options.hasDocument) {
      validFields += 1;
    } else {
      issues.push({
        champ: "documents",
        type: "DOCUMENT_MANQUANT",
        gravite: "MOYENNE",
        description: "Aucun document numérisé associé à ce dossier.",
      });
    }
  }

  return {
    totalFields,
    validFields,
    score: Math.round((validFields / totalFields) * 100),
    issues,
  };
}
