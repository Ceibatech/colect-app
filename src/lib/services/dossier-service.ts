"use server";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { dossierSubmitSchema, type DossierFormValues } from "@/lib/validation/dossier";
import type { SessionPayload } from "@/lib/auth/session";
import { Prisma } from "@prisma/client";

const MAX_REFERENCE_ATTEMPTS = 5;

/**
 * Détermine la fiche opérateur à associer au dossier.
 * - OPERATEUR : toujours sa propre fiche (ignore toute valeur du formulaire).
 * - ADMIN / SUPERVISEUR : opérateur choisi dans le formulaire (saisie pour
 *   le compte d'un opérateur terrain).
 */
async function resolveOperateurId(session: SessionPayload, formOperateurId?: number): Promise<number> {
  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if (!operateur) {
      throw new Error("Aucune fiche opérateur n'est associée à votre compte. Contactez un administrateur.");
    }
    return operateur.id;
  }

  if (!formOperateurId) {
    throw new Error("Veuillez sélectionner l'opérateur ayant réalisé la collecte.");
  }
  const operateur = await prisma.operateur.findUnique({ where: { id: formOperateurId } });
  if (!operateur || !operateur.isActive) {
    throw new Error("Opérateur invalide ou inactif.");
  }
  return operateur.id;
}

/**
 * Convertit les valeurs brutes du formulaire pour le stockage : chaînes
 * vides -> `null`, champs numériques robustement coercés (ne jamais faire
 * confiance au client — un <input type="number"> vide envoie `""`, pas
 * `undefined`, ce que Prisma refuse pour un champ Decimal/Int).
 *
 * `lotissementId` (FK réelle) n'est volontairement PAS calculé ici : la
 * saisie est libre côté formulaire (`lotissementNom`) et résolue séparément
 * par `resolveLotissementId()`, qui a besoin d'un accès base (find-or-create)
 * — cette fonction reste synchrone et pure.
 */
function cleanForDb(values: DossierFormValues) {
  const clean = <T>(v: T | "" | undefined): T | undefined => (v === "" ? undefined : v);
  const toNullableNumber = (v: unknown): number | null => {
    if (v === "" || v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    libelleCarton: clean(values.libelleCarton) ?? null,
    codeBarres: clean(values.codeBarres) ?? null,
    numeroGuichet: clean(values.numeroGuichet) ?? null,
    numeroDdu: clean(values.numeroDdu) ?? null,
    numeroDirectionService: clean(values.numeroDirectionService) ?? null,
    referenceClassement: clean(values.referenceClassement) ?? null,
    numeroIlot: clean(values.numeroIlot) ?? null,
    numeroLot: clean(values.numeroLot) ?? null,
    superficie: toNullableNumber(values.superficie),
    numeroTitreFoncier: clean(values.numeroTitreFoncier) ?? null,
    communeId: toNullableNumber(values.communeId),
    natureDossierId: toNullableNumber(values.natureDossierId),
    nom: clean(values.nom) ?? null,
    prenoms: clean(values.prenoms) ?? null,
    adresse: clean(values.adresse) ?? null,
    telephone: clean(values.telephone) ?? null,
    email: clean(values.email) ?? null,
    personneContact: clean(values.personneContact) ?? null,
    mobile: clean(values.mobile) ?? null,
    nombrePages: toNullableNumber(values.nombrePages),
    observations: clean(values.observations) ?? null,
  };
}

/** Génère un code de lotissement unique, dérivé du code commune. */
async function generateLotissementCode(communeId: number): Promise<string> {
  const commune = await prisma.commune.findUnique({ where: { id: communeId }, select: { code: true } });
  const base = commune?.code ?? `C${communeId}`;
  const count = await prisma.lotissement.count({ where: { communeId } });
  let n = count + 1;
  for (let attempts = 0; attempts < 1000; attempts++) {
    const candidate = `${base}-LOT-${String(n).padStart(3, "0")}`;
    const exists = await prisma.lotissement.findUnique({ where: { code: candidate } });
    if (!exists) return candidate;
    n++;
  }
  throw new Error("Impossible de générer un code de lotissement unique.");
}

/**
 * Résout la saisie libre "Lotissement" (Phase 15+) vers une fiche réelle du
 * référentiel `lotissements`, scopée à la commune choisie :
 * - correspondance existante (insensible à la casse/aux espaces) -> réutilisée ;
 * - sinon création à la volée, jamais de doublon silencieux pour la même commune.
 * Ne fait jamais confiance au client — la résolution est refaite à chaque
 * enregistrement, comme le reste de `cleanForDb`.
 */
async function resolveLotissementId(communeId: number | null | undefined, nomLibre: string | undefined): Promise<number | null> {
  const nom = nomLibre?.trim();
  if (!communeId || !nom) return null;

  const existing = await prisma.lotissement.findFirst({
    where: { communeId, nom: { equals: nom } },
  });
  if (existing) return existing.id;

  const code = await generateLotissementCode(communeId);
  const created = await prisma.lotissement.create({
    data: { communeId, code, nom, isActive: true },
  });
  return created.id;
}

/**
 * Génère une référence unique DOS-{année}-{séquence}. Approche "count + retry
 * sur conflit" — suffisante pour le volume attendu en V1. Sous forte
 * concurrence, un verrou/séquence DB dédié serait préférable (limite
 * documentée, cf. DATABASE.md).
 */
async function createDossierWithUniqueReference(
  data: Omit<Prisma.DossierUncheckedCreateInput, "reference">
) {
  const year = new Date().getFullYear();
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_REFERENCE_ATTEMPTS) {
    const count = await prisma.dossier.count({ where: { reference: { startsWith: `DOS-${year}-` } } });
    const reference = `DOS-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    try {
      return await prisma.dossier.create({ data: { ...data, reference } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        lastError = e;
        attempt++;
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error("Impossible de générer une référence de dossier unique.");
}

export interface DraftResult {
  id: number;
  reference: string;
}

export async function saveDraft(values: DossierFormValues, draftId?: number | null): Promise<DraftResult> {
  const session = await requirePermission("DOSSIER_CREATE");
  const operateurId = await resolveOperateurId(session, values.operateurId);
  const cleaned = cleanForDb(values);
  const lotissementId = await resolveLotissementId(cleaned.communeId, values.lotissementNom);
  const data = { ...cleaned, lotissementId };

  if (values.codeBarres) {
    const existing = await prisma.dossier.findFirst({
      where: { codeBarres: values.codeBarres, ...(draftId ? { id: { not: draftId } } : {}) },
      select: { id: true, reference: true },
    });
    if (existing) {
      throw new Error(`Ce code-barres est déjà utilisé par le dossier ${existing.reference}.`);
    }
  }

  if (draftId) {
    const existing = await prisma.dossier.findUnique({ where: { id: draftId } });
    if (!existing) throw new Error("Brouillon introuvable.");
    if (existing.statutCollecte !== "BROUILLON") {
      throw new Error("Ce dossier a déjà été soumis et ne peut plus être modifié comme brouillon.");
    }
    if (session.roleCode === "OPERATEUR" && existing.operateurId !== operateurId) {
      throw new Error("Vous ne pouvez modifier que vos propres brouillons.");
    }
    const updated = await prisma.dossier.update({
      where: { id: draftId },
      data: { ...data, operateurId },
    });
    return { id: updated.id, reference: updated.reference };
  }

  const created = await createDossierWithUniqueReference({
    ...data,
    operateurId,
    statutCollecte: "BROUILLON",
  });

  await prisma.dossierHistory.create({
    data: { dossierId: created.id, userId: session.userId, action: "CREATION", nouveauStatut: "BROUILLON" },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOSSIER_CREATE",
      entity: "DOSSIER",
      entityId: created.id,
      ipAddress: await getClientIp(),
    },
  });

  return { id: created.id, reference: created.reference };
}

export interface SubmitResult {
  id: number;
  reference: string;
}

export async function submitDossier(values: DossierFormValues, draftId?: number | null): Promise<SubmitResult> {
  const session = await requirePermission("DOSSIER_CREATE");

  const parsed = dossierSubmitSchema.safeParse(values);
  if (!parsed.success) {
    throw new Error("Certains champs obligatoires sont manquants ou invalides. Vérifiez le récapitulatif.");
  }

  // S'assure qu'un brouillon existe (créé à la volée si l'utilisateur soumet
  // directement sans être passé par "Enregistrer brouillon").
  const draft = await saveDraft(values, draftId ?? undefined);

  const now = new Date();
  const updated = await prisma.dossier.update({
    where: { id: draft.id },
    data: {
      statutCollecte: "SOUMIS",
      statutValidation: "EN_CONTROLE",
      dateSoumission: now,
    },
  });

  await prisma.$transaction([
    prisma.dossierHistory.create({
      data: {
        dossierId: draft.id,
        userId: session.userId,
        action: "SOUMISSION",
        ancienStatut: "BROUILLON",
        nouveauStatut: "SOUMIS",
      },
    }),
    prisma.workflowTransition.create({
      data: {
        dossierId: draft.id,
        workflowType: "COLLECTE",
        fromStatus: "BROUILLON",
        toStatus: "SOUMIS",
        userId: session.userId,
      },
    }),
    prisma.workflowTransition.create({
      data: {
        dossierId: draft.id,
        workflowType: "VALIDATION",
        fromStatus: "EN_ATTENTE",
        toStatus: "EN_CONTROLE",
        userId: session.userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "DOSSIER_SUBMIT",
        entity: "DOSSIER",
        entityId: draft.id,
        ipAddress: await getClientIp(),
      },
    }),
  ]);

  return { id: updated.id, reference: updated.reference };
}

export async function listMyDrafts() {
  const session = await requirePermission("DOSSIER_CREATE");

  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if (!operateur) return [];
    return prisma.dossier.findMany({
      where: { operateurId: operateur.id, statutCollecte: "BROUILLON" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, reference: true, nom: true, prenoms: true, updatedAt: true },
    });
  }

  // ADMIN / SUPERVISEUR : pas de fiche opérateur personnelle en usage normal,
  // donc pas de liste de "mes brouillons" à reprendre (ils créent au nom
  // d'un opérateur sélectionné dans le formulaire).
  return [];
}

export async function getDraftById(id: number) {
  const session = await requirePermission("DOSSIER_CREATE");
  // `lotissement` inclus pour reconstituer `lotissementNom` (saisie libre,
  // cf. resolveLotissementId ci-dessus) lors de la reprise d'un brouillon.
  const dossier = await prisma.dossier.findUnique({ where: { id }, include: { lotissement: true } });
  if (!dossier || dossier.statutCollecte !== "BROUILLON") return null;

  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if (!operateur || dossier.operateurId !== operateur.id) return null;
  }

  return dossier;
}
