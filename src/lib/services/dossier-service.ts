"use server";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { dossierSubmitSchema, type DossierFormValues } from "@/lib/validation/dossier";
import type { SessionPayload } from "@/lib/auth/session";
import { Prisma } from "@prisma/client";
import {
  canonicalizeLotissementLabel,
  expectedCommuneForLotissement,
  localityMatchKey,
} from "@/lib/utils/locality-normalization";
import { evaluateInventorySubmission } from "@/lib/workflow/automatic-validation";
import { resolveCartonId } from "@/lib/cartons/persistence";
import { assignDossierCote, findCartonByCote } from "@/lib/cartons/cote-assignment";
import { findRubrique, rubriqueOfCote, type Rubrique } from "@/lib/referentiel/classement";

const MAX_REFERENCE_ATTEMPTS = 5;

/**
 * Détermine la fiche opérateur à associer au dossier.
 * - OPERATEUR : toujours sa propre fiche (ignore toute valeur du formulaire).
 * - ADMIN / SUPERVISEUR : opérateur choisi dans le formulaire (saisie pour
 *   le compte d'un opérateur terrain).
 */
/**
 * L'opérateur d'un dossier est toujours la personne connectée qui le
 * renseigne : jamais choisi dans une liste. Sa fiche opérateur est créée au
 * premier dossier si elle n'existe pas (matricule OP-xxx).
 */
async function resolveOperateurId(session: SessionPayload): Promise<number> {
  const existing = await prisma.operateur.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (existing) return existing.id;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } });
  if (!user) throw new Error("Compte introuvable : reconnectez-vous.");
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await prisma.operateur.count();
    const matricule = `OP-${String(count + 1 + attempt).padStart(3, "0")}`;
    try {
      const created = await prisma.operateur.create({ data: { userId: session.userId, matricule, nom: user.name, email: user.email, isActive: true }, select: { id: true } });
      return created.id;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const raced = await prisma.operateur.findUnique({ where: { userId: session.userId }, select: { id: true } });
      if (raced) return raced.id;
    }
  }
  throw new Error("Impossible de créer votre fiche opérateur. Réessayez.");
}

/**
 * Convertit les valeurs brutes du formulaire pour le stockage : chaînes
 * vides -> `null`, champs numériques robustement coercés (ne jamais faire
 * confiance au client — un <input type="number"> vide envoie `""`, pas
 * `undefined`, ce que Prisma refuse pour un champ Decimal/Int).
 *
 * `lotissementId` et `natureDossierId` (FK réelles) ne sont volontairement
 * PAS calculés ici : les libellés du formulaire sont résolus séparément par
 * `resolveLotissementId()`/`resolveNatureDossierId()`, qui
 * ont besoin d'un accès base (find-or-create) — cette fonction reste
 * synchrone et pure.
 */
function cleanForDb(values: DossierFormValues) {
  const clean = <T>(v: T | "" | undefined): T | undefined => (v === "" ? undefined : v);
  const toNullableNumber = (v: unknown): number | null => {
    if (v === "" || v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    siteId: toNullableNumber(values.siteId),
    entrepotId: toNullableNumber(values.entrepotId),
    libelleCarton: clean(values.libelleCarton) ?? null,
    codeBarres: clean(values.codeBarres) ?? null,
    numeroGuichet: clean(values.numeroGuichet) ?? null,
    numeroDdu: clean(values.numeroDdu) ?? null,
    numeroDirectionService: clean(values.numeroDirectionService) ?? null,
    referenceClassement: clean(values.referenceClassement) ?? null,
    etatCarton: clean(values.etatCarton) ?? null,
    // Description ignorée si l'état n'est pas DEGRADE — évite de garder une
    // description périmée si l'utilisateur repasse en "Bon état" après avoir
    // rédigé un texte puis changé d'avis (retour en arrière via "Modifier").
    etatCartonDescription: values.etatCarton === "DEGRADE" ? clean(values.etatCartonDescription) ?? null : null,
    numeroIlot: clean(values.numeroIlot)?.trim().toUpperCase() ?? null,
    numeroLot: clean(values.numeroLot)?.trim().toUpperCase() ?? null,
    superficie: toNullableNumber(values.superficie),
    numeroTitreFoncier: values.sansTitreFoncier ? null : clean(values.numeroTitreFoncier)?.trim() ?? null,
    sansTitreFoncier: values.sansTitreFoncier === true,
    anneeActe: toNullableNumber(values.anneeActe),
    communeId: toNullableNumber(values.communeId),
    etatDossier: clean(values.etatDossier) ?? null,
    etatDossierDescription: values.etatDossier === "DEGRADE" ? clean(values.etatDossierDescription) ?? null : null,
    nom: clean(values.nom) ?? null,
    prenoms: clean(values.prenoms) ?? null,
    adresse: clean(values.adresse) ?? null,
    telephone: clean(values.telephone) ?? null,
    email: clean(values.email) ?? null,
    personneContact: clean(values.personneContact) ?? null,
    mobile: clean(values.mobile) ?? null,
    observations: clean(values.observations) ?? null,
  };
}

/** Génère un code technique pour une nouvelle localité proposée sur le terrain. */
async function generateLotissementCode(communeId: number): Promise<string> {
  const commune = await prisma.commune.findUnique({ where: { id: communeId }, select: { code: true } });
  const base = commune?.code ?? `C${communeId}`;
  const count = await prisma.lotissement.count({ where: { communeId } });
  let sequence = count + 1;

  for (let attempt = 0; attempt < 1000; attempt++, sequence++) {
    const candidate = `${base}-LOT-${String(sequence).padStart(3, "0")}`;
    if (!(await prisma.lotissement.findUnique({ where: { code: candidate } }))) return candidate;
  }
  throw new Error("Impossible de générer le code de la nouvelle localité.");
}

/**
 * Résout un lotissement existant ou crée une nouvelle proposition contrôlée.
 * Les alias historiques sont harmonisés avant toute recherche/création.
 */
async function resolveLotissementId(communeId: number | null | undefined, nomLibre: string | undefined): Promise<number | null> {
  const nom = nomLibre?.trim();
  if (!communeId || !nom) return null;

  const commune = await prisma.commune.findUnique({ where: { id: communeId }, select: { nom: true, isActive: true } });
  if (!commune?.isActive) throw new Error("La commune sélectionnée est introuvable ou inactive.");

  const expectedCommune = expectedCommuneForLotissement(nom);
  if (expectedCommune && localityMatchKey(commune.nom) !== localityMatchKey(expectedCommune)) {
    throw new Error(`Le lotissement « ${canonicalizeLotissementLabel(nom)} » appartient à la commune de ${expectedCommune}.`);
  }

  const canonicalName = canonicalizeLotissementLabel(nom);
  const activeLotissements = await prisma.lotissement.findMany({
    where: { communeId, isActive: true },
    select: { id: true, nom: true },
  });
  const existing = activeLotissements.find(
    (lotissement) => localityMatchKey(canonicalizeLotissementLabel(lotissement.nom)) === localityMatchKey(canonicalName),
  );
  if (existing) return existing.id;

  const code = await generateLotissementCode(communeId);
  const created = await prisma.lotissement.create({
    data: {
      communeId,
      code,
      nom: canonicalName,
      description: "Localité proposée depuis la collecte et harmonisée automatiquement.",
      isActive: true,
    },
  });
  return created.id;
}

/** Génère un code de nature de dossier unique. */
async function generateNatureCode(): Promise<string> {
  const count = await prisma.natureDossier.count();
  let n = count + 1;
  for (let attempts = 0; attempts < 1000; attempts++) {
    const candidate = `NAT-${String(n).padStart(3, "0")}`;
    const exists = await prisma.natureDossier.findUnique({ where: { code: candidate } });
    if (!exists) return candidate;
    n++;
  }
  throw new Error("Impossible de générer un code de nature de dossier unique.");
}

/**
 * Résout la "Nature du dossier" (Phase 15+) : soit l'identifiant choisi
 * dans la liste fermée (`natureDossierId`), soit — si "Autres" a été
 * sélectionné dans le formulaire — la saisie libre `natureDossierAutre`,
 * résolue vers une fiche `natures_dossier` existante (insensible à la
 * casse) ou créée à la volée. Pas de scope par commune ici (contrairement
 * au Lotissement) : une nature de dossier n'est pas rattachée à une
 * commune.
 */
async function resolveNatureDossierId(natureDossierId: number | null, autreLibre: string | undefined): Promise<number | null> {
  if (natureDossierId) return natureDossierId;
  const libelle = autreLibre?.trim();
  if (!libelle) return null;

  const existing = await prisma.natureDossier.findFirst({ where: { libelle: { equals: libelle } } });
  if (existing) return existing.id;

  const code = await generateNatureCode();
  const created = await prisma.natureDossier.create({ data: { code, libelle, isActive: true } });
  return created.id;
}

/**
 * Génère une référence unique DOS-{année}-{séquence}. Approche "count + retry
 * sur conflit" — suffisante pour le volume attendu en V1. Sous forte
 * concurrence, un verrou/séquence DB dédié serait préférable (limite
 * documentée, cf. DATABASE.md).
 */
async function createDossierWithUniqueReference(
  data: Omit<Prisma.DossierUncheckedCreateInput, "reference">,
  tx: Prisma.TransactionClient,
) {
  const year = new Date().getFullYear();
  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_REFERENCE_ATTEMPTS) {
    const count = await tx.dossier.count({ where: { reference: { startsWith: `DOS-${year}-` } } });
    const reference = `DOS-${year}-${String(count + 1 + attempt).padStart(6, "0")}`;
    try {
      return await tx.dossier.create({ data: { ...data, reference } });
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

/** Nature correspondant à une rubrique du référentiel (code = n° de rubrique), créée au besoin. */
async function natureForRubrique(rubrique: Rubrique): Promise<number> {
  const nature = await prisma.natureDossier.upsert({
    where: { code: rubrique.code },
    update: {},
    create: { code: rubrique.code, libelle: rubrique.libelle, description: "Référentiel de classement des archives du MULCV" },
    select: { id: true },
  });
  return nature.id;
}

/** Carton désigné par sa cote dans le formulaire d'inventaire, avec son emplacement et son libellé. */
async function chosenCarton(value: string | undefined) {
  if (!value?.trim()) return null;
  const carton = await findCartonByCote(prisma, value);
  if (!carton) throw new Error(`Aucun carton ne porte la cote « ${value.trim()} ». Vérifiez la cote ou laissez le champ vide pour un nouveau carton.`);
  const sample = await prisma.dossier.findFirst({
    where: { cartonId: carton.id },
    orderBy: { id: "asc" },
    select: { siteId: true, entrepotId: true, libelleCarton: true },
  });
  return { id: carton.id, cote: carton.cote ?? value.trim(), siteId: sample?.siteId ?? null, entrepotId: sample?.entrepotId ?? null, libelleCarton: sample?.libelleCarton ?? null };
}

export interface DraftResult {
  id: number;
  reference: string;
  /** Cote du dossier (2010-KOU-0001-012) et de son carton, une fois rangé. */
  cote: string | null;
  cartonCote: string | null;
}

async function cotesOf(id: number) {
  const dossier = await prisma.dossier.findUnique({ where: { id }, select: { cote: true, carton: { select: { cote: true } } } });
  return { cote: dossier?.cote ?? null, cartonCote: dossier?.carton?.cote ?? null };
}

export async function saveDraft(values: DossierFormValues, draftId?: number | null): Promise<DraftResult> {
  const session = await requirePermission("DOSSIER_CREATE");
  const operateurId = await resolveOperateurId(session);
  const cleaned = cleanForDb(values);
  const lotissementId = await resolveLotissementId(cleaned.communeId, values.lotissementNom);
  const natureDossierId = await resolveNatureDossierId(values.natureDossierId ?? null, values.natureDossierAutre);
  const data = { ...cleaned, lotissementId, natureDossierId };
  if (values.modeCarton === "EXISTANT" && !values.cartonCote?.trim()) {
    throw new Error("Choisissez le carton auquel ajouter ce dossier (sa cote), ou répondez « Nouveau carton ».");
  }
  const rubrique = values.modeCarton === "NOUVEAU" ? findRubrique(values.classement || "2010") : null;
  if (values.modeCarton === "NOUVEAU" && !rubrique) throw new Error("Choisissez la rubrique de classement du nouveau carton.");
  const chosen = values.modeCarton === "NOUVEAU" ? null : await chosenCarton(values.cartonCote);
  // Règle du référentiel : la nature du dossier est la rubrique de son carton.
  const cartonRubrique = rubrique ?? rubriqueOfCote(chosen?.cote);
  if (cartonRubrique) data.natureDossierId = await natureForRubrique(cartonRubrique);
  if (chosen) {
    if (data.siteId && chosen.siteId && data.siteId !== chosen.siteId) {
      throw new Error(`Le carton ${chosen.cote} est rangé sur un autre site. Choisissez ce site ou un autre carton.`);
    }
    // Le dossier prend l'emplacement et le libellé du carton choisi.
    data.siteId = chosen.siteId ?? data.siteId;
    data.entrepotId = chosen.entrepotId ?? data.entrepotId;
    data.libelleCarton = chosen.libelleCarton ?? data.libelleCarton;
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
    const updated = await prisma.$transaction(async (tx) => {
      const cartonId = await resolveCartonId(tx, data, existing, chosen?.id, values.modeCarton === "NOUVEAU");
      const updated = await tx.dossier.updateMany({
        // A transfer or another edit may have committed while we waited for
        // the carton lock. Never restore the stale form's previous location.
        where: {
          id: draftId, updatedAt: existing.updatedAt, statutCollecte: "BROUILLON",
          cartonId: existing.cartonId, siteId: existing.siteId, entrepotId: existing.entrepotId,
        },
        // Le brouillon garde l'opérateur qui l'a créé.
        data: { ...data, operateurId: existing.operateurId, cartonId },
      });
      if (updated.count !== 1) throw new Error("Ce dossier a été modifié ou déplacé pendant la saisie. Rechargez sa fiche avant de l'enregistrer.");
      await assignDossierCote(tx, existing.id, rubrique?.code);
      return { id: existing.id, reference: existing.reference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 60_000 });
    return { id: updated.id, reference: updated.reference, ...(await cotesOf(updated.id)) };
  }

  const created = await prisma.$transaction(async (tx) => {
    const cartonId = await resolveCartonId(tx, data, undefined, chosen?.id, values.modeCarton === "NOUVEAU");
    const dossier = await createDossierWithUniqueReference({
      ...data,
      operateurId,
      cartonId,
      statutCollecte: "BROUILLON",
    }, tx);
    await assignDossierCote(tx, dossier.id, rubrique?.code);
    return dossier;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 60_000 });

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

  return { id: created.id, reference: created.reference, ...(await cotesOf(created.id)) };
}

export interface SubmitResult {
  id: number;
  reference: string;
  cote: string | null;
  cartonCote: string | null;
  autoValidated: boolean;
  anomalyCount: number;
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
  if (values.modeCarton && !draft.cartonCote) {
    throw new Error("Le dossier n'a pas pu être rangé dans un carton. Revenez à la première étape.");
  }

  const dossier = await prisma.dossier.findUnique({
    where: { id: draft.id },
    select: {
      id: true,
      cartonId: true,
      codeBarres: true,
      siteId: true,
      entrepotId: true,
      entrepot: { select: { siteId: true } },
      etatCarton: true,
      etatCartonDescription: true,
      etatDossier: true,
      etatDossierDescription: true,
    },
  });
  if (!dossier) throw new Error("Brouillon introuvable.");

  const duplicateBarcode = dossier.codeBarres
    ? (await prisma.dossier.count({
        where: {
          id: { not: dossier.id },
          codeBarres: dossier.codeBarres,
          siteId: dossier.siteId,
          entrepotId: dossier.entrepotId,
          ...(dossier.cartonId != null
            ? { OR: [{ cartonId: { not: dossier.cartonId } }, { cartonId: null }] }
            : {}),
        },
      })) > 0
    : false;
  const decision = evaluateInventorySubmission({
    codeBarres: dossier.codeBarres,
    duplicateBarcode,
    siteId: dossier.siteId,
    entrepotId: dossier.entrepotId,
    entrepotSiteId: dossier.entrepot?.siteId ?? null,
    etatCarton: dossier.etatCarton,
    etatCartonDescription: dossier.etatCartonDescription,
    etatDossier: dossier.etatDossier,
    etatDossierDescription: dossier.etatDossierDescription,
  });

  const now = new Date();
  const validationStatus = decision.autoValidated ? "VALIDE" : "EN_CONTROLE";
  const ipAddress = await getClientIp();

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.dossier.update({
      where: { id: draft.id },
      data: {
        statutCollecte: "SOUMIS",
        statutValidation: validationStatus,
        dateSoumission: now,
        dateValidation: decision.autoValidated ? now : null,
      },
    });
    await tx.qualityCheck.create({
      data: {
        dossierId: draft.id,
        userId: null,
        typeControle: "CONTROLE_AUTOMATIQUE_SOUMISSION",
        score: decision.score,
        statut: decision.autoValidated ? "CONFORME" : "A_CORRIGER",
        nombreAnomalies: decision.issues.length,
        commentaire: decision.autoValidated
          ? "Fiche conforme aux règles bloquantes : validation automatique."
          : "Fiche orientée vers le superviseur : anomalie bloquante détectée.",
        ...(decision.issues.length > 0
          ? {
              anomalies: {
                create: decision.issues.map((issue) => ({
                  dossierId: draft.id,
                  type: issue.type,
                  champ: issue.champ,
                  description: issue.description,
                  gravite: issue.gravite,
                })),
              },
            }
          : {}),
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: draft.id,
        userId: session.userId,
        action: "SOUMISSION",
        ancienStatut: "BROUILLON",
        nouveauStatut: "SOUMIS",
      },
    });
    await tx.workflowTransition.create({
      data: {
        dossierId: draft.id,
        workflowType: "COLLECTE",
        fromStatus: "BROUILLON",
        toStatus: "SOUMIS",
        userId: session.userId,
      },
    });
    await tx.workflowTransition.create({
      data: {
        dossierId: draft.id,
        workflowType: "VALIDATION",
        fromStatus: "EN_ATTENTE",
        toStatus: validationStatus,
        userId: decision.autoValidated ? null : session.userId,
        commentaire: decision.autoValidated
          ? "Validation automatique : aucune anomalie bloquante."
          : `${decision.issues.length} anomalie(s) à examiner.`,
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: draft.id,
        userId: decision.autoValidated ? null : session.userId,
        action: decision.autoValidated ? "VALIDATION_AUTOMATIQUE" : "ANOMALIE_DETECTEE",
        ancienStatut: "EN_ATTENTE",
        nouveauStatut: validationStatus,
        commentaire: decision.autoValidated
          ? "La fiche poursuit automatiquement la chaîne de traitement."
          : `${decision.issues.length} anomalie(s) transmise(s) au superviseur.`,
        metadata: { score: decision.score, anomalies: decision.issues.length },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "DOSSIER_SUBMIT",
        entity: "DOSSIER",
        entityId: draft.id,
        newValue: { validationStatus, anomalyCount: decision.issues.length },
        ipAddress,
      },
    });
    return result;
  });

  return {
    id: updated.id,
    reference: updated.reference,
    cote: draft.cote,
    cartonCote: draft.cartonCote,
    autoValidated: decision.autoValidated,
    anomalyCount: decision.issues.length,
  };
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
  // `lotissement` inclus pour reconstituer le libellé sélectionné.
  const dossier = await prisma.dossier.findUnique({ where: { id }, include: { lotissement: true, carton: { select: { cote: true } } } });
  if (!dossier || dossier.statutCollecte !== "BROUILLON") return null;

  if (session.roleCode === "OPERATEUR") {
    const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
    if (!operateur || dossier.operateurId !== operateur.id) return null;
  }

  return dossier;
}
