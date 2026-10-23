import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { ApiError } from "@/lib/utils/api-error";
import { isOperateurInScope } from "@/lib/services/access-scope";
import { isAlfrescoDigitalArchiveEnabled } from "@/lib/archive/alfresco-client";
import type { SessionPayload } from "@/lib/auth/session";
import type { PreparationInput } from "@/lib/validation/preparation";
import {
  canonicalizeTypePieceLabel,
  getTypePieceMatchKey,
} from "@/lib/utils/type-piece-normalization";
import {
  advanceDossierAfterDocumentAvailable,
  reconcileDossierIndexation,
} from "@/lib/services/workflow-automation-service";

async function getDossierOr404(id: number) {
  const dossier = await prisma.dossier.findUnique({ where: { id } });
  if (!dossier) throw new ApiError("Dossier introuvable.", 404);
  return dossier;
}

async function resolveOperateurId(session: SessionPayload): Promise<number | null> {
  if (session.roleCode !== "OPERATEUR") return null;
  const operateur = await prisma.operateur.findUnique({ where: { userId: session.userId } });
  return operateur?.id ?? null;
}

/**
 * Phase 16+ (affectation opérateur -> superviseur), réutilisée Phase 19+
 * pour les 4 étapes (Collecte/Numérisation/Indexation/Archivage) : un
 * SUPERVISEUR ne peut valider/rejeter que les dossiers des opérateurs qui
 * lui sont affectés (Operateur.supervisorId). Ne s'applique pas aux autres
 * rôles disposant des permissions *_VALIDATE/*_REJECT (seul ADMIN les a en
 * plus de SUPERVISEUR — pas de restriction pour lui).
 */
async function assertSupervisorScope(session: SessionPayload, operateurId: number) {
  if (session.roleCode !== "SUPERVISEUR") return;
  if (!(await isOperateurInScope(session, operateurId))) {
    throw new ApiError(
      "Vous ne pouvez valider que les dossiers des opérateurs qui vous sont affectés.",
      403
    );
  }
}

/**
 * Le workflow linéaire (§42) : un dossier ne peut pas être ARCHIVÉ s'il n'est
 * pas INDEXÉ, ni INDEXÉ s'il n'est pas NUMÉRISÉ, ni NUMÉRISÉ s'il n'est pas
 * VALIDÉ, ni VALIDÉ/REJETÉ s'il n'est pas EN CONTRÔLE (donc SOUMIS).
 * Chaque fonction vérifie sa propre précondition avant toute écriture —
 * défense en profondeur, jamais de confiance dans l'état affiché au client.
 */

export async function validateDossier(id: number, commentaire?: string) {
  const session = await requireApiPermission("DOSSIER_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutValidation !== "EN_CONTROLE") {
    throw new ApiError(
      `Impossible de valider : le dossier doit être "En contrôle" (statut actuel : ${dossier.statutValidation}).`
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.dossier.update({ where: { id }, data: { statutValidation: "VALIDE", dateValidation: now } });
    await tx.anomalie.updateMany({
      where: {
        dossierId: id,
        statut: { in: ["OUVERTE", "EN_COURS"] },
        qualityCheck: { typeControle: "CONTROLE_AUTOMATIQUE_SOUMISSION" },
      },
      data: { statut: "IGNOREE", corrigePar: session.userId, corrigeLe: now },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "VALIDATION",
        ancienStatut: "EN_CONTROLE",
        nouveauStatut: "VALIDE",
        commentaire,
      },
    });
    await tx.workflowTransition.create({
      data: { dossierId: id, workflowType: "VALIDATION", fromStatus: "EN_CONTROLE", toStatus: "VALIDE", userId: session.userId, commentaire },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    });
    return result;
  });

  return updated;
}

export async function rejectDossier(id: number, commentaire: string) {
  const session = await requireApiPermission("DOSSIER_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutValidation !== "EN_CONTROLE") {
    throw new ApiError(
      `Impossible de rejeter : le dossier doit être "En contrôle" (statut actuel : ${dossier.statutValidation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutValidation: "REJETE", dateValidation: now } }),
    prisma.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "REJET",
        ancienStatut: "EN_CONTROLE",
        nouveauStatut: "REJETE",
        commentaire,
      },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "VALIDATION", fromStatus: "EN_CONTROLE", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

/**
 * Validation par exception : une étape cohérente atteint directement
 * TERMINE. A_VALIDER est réservé aux anomalies qui nécessitent une décision
 * humaine :
 *
 *   EN_ATTENTE/EN_COURS --(contrôle conforme)--> TERMINE
 *   EN_ATTENTE/EN_COURS --(anomalie)--> A_VALIDER
 *     --(superviseur valide)--> TERMINE
 *     --(superviseur rejette)--> REJETE --(opérateur relance)--> A_VALIDER
 */

/** Génère un code de type de pièce unique. */
async function generateTypePieceCode(): Promise<string> {
  const count = await prisma.typePiece.count();
  let n = count + 1;
  for (let attempts = 0; attempts < 1000; attempts++) {
    const candidate = `PIE-${String(n).padStart(3, "0")}`;
    const exists = await prisma.typePiece.findUnique({ where: { code: candidate } });
    if (!exists) return candidate;
    n++;
  }
  throw new Error("Impossible de générer un code de type de pièce unique.");
}

/**
 * Résout les "Types de pièces" (Phase 18+, déplacé en Phase 20+ de la
 * Collecte vers l'étape Préparation) — sélection multiple, chaque entrée
 * étant soit l'id (chaîne numérique) d'un `TypePiece` existant, soit une
 * saisie libre ajoutée à la volée (préfixée "new:" côté interface, cf.
 * TypesPiecesField.tsx), résolue ici vers une fiche `types_piece` canonique
 * existante ou créée. La comparaison tolère casse, accents, ponctuation et
 * abréviations métier connues. Ne fait jamais confiance aux ids envoyés par
 * le client sans les revérifier en base — même principe que le reste de ce
 * fichier.
 */
type ResolvedPreparationPieceLine = {
  typePieceId: number;
  libelle: string;
  nombrePieces: number;
  nombrePages: number;
};

async function resolvePreparationPieceLines(
  lines: PreparationInput["pieceBreakdown"],
): Promise<ResolvedPreparationPieceLine[]> {
  const knownTypes = await prisma.typePiece.findMany({
    select: { id: true, libelle: true },
  });
  const resolved: ResolvedPreparationPieceLine[] = [];

  for (const line of lines) {
    const token = line.typePiece;
    let typePiece: { id: number; libelle: string } | undefined;
    if (token.startsWith("new:")) {
      const libelle = canonicalizeTypePieceLabel(token.slice(4));
      if (!libelle) throw new ApiError("Le libellé d'un type de pièce est requis.");
      const matchKey = getTypePieceMatchKey(libelle);
      const existing = knownTypes.find((type) => getTypePieceMatchKey(type.libelle) === matchKey);
      if (existing) {
        typePiece = existing;
      } else {
        const code = await generateTypePieceCode();
        const created = await prisma.typePiece.create({ data: { code, libelle, isActive: true } });
        typePiece = { id: created.id, libelle: created.libelle };
        knownTypes.push(typePiece);
      }
    } else {
      const id = Number(token);
      if (!Number.isInteger(id) || id <= 0) throw new ApiError("Type de pièce invalide.");
      typePiece = knownTypes.find((type) => type.id === id);
      if (!typePiece) throw new ApiError("Type de pièce introuvable.");
    }

    if (resolved.some((item) => item.typePieceId === typePiece.id)) {
      throw new ApiError(`Le type de pièce « ${typePiece.libelle} » est déclaré plusieurs fois.`);
    }
    resolved.push({
      typePieceId: typePiece.id,
      libelle: typePiece.libelle,
      nombrePieces: line.nombrePieces,
      nombrePages: line.nombrePages,
    });
  }

  return resolved;
}

const PREPARATION_CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Réserve un dossier pour un préparateur. Plusieurs agents peuvent travailler
 * sur le même carton, mais jamais simultanément sur le même dossier. Une prise
 * en charge abandonnée redevient récupérable après deux heures.
 */
export async function claimPreparation(id: number) {
  const session = await requireApiPermission("PREPARATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutValidation !== "VALIDE") {
    throw new ApiError("Seul un dossier validé peut être pris en charge pour la préparation.");
  }
  if (dossier.statutPreparation === "A_VALIDER" || dossier.statutPreparation === "TERMINE") {
    throw new ApiError("Ce dossier n'est plus disponible dans la file de préparation.");
  }

  const cutoff = new Date(Date.now() - PREPARATION_CLAIM_TTL_MS);
  const claimIsFresh = dossier.preparationClaimedAt && dossier.preparationClaimedAt >= cutoff;
  if (dossier.statutPreparation === "EN_COURS" && dossier.preparateurId === session.userId && claimIsFresh) {
    return dossier;
  }

  const ipAddress = await getClientIp();
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.dossier.updateMany({
      where: {
        id,
        OR: [
          { statutPreparation: { in: ["EN_ATTENTE", "REJETE"] } },
          {
            statutPreparation: "EN_COURS",
            OR: [
              { preparateurId: session.userId },
              { preparationClaimedAt: null },
              { preparationClaimedAt: { lt: cutoff } },
            ],
          },
        ],
      },
      data: {
        statutPreparation: "EN_COURS",
        preparateurId: session.userId,
        preparationClaimedAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      const current = await tx.dossier.findUnique({
        where: { id },
        include: { preparateur: { select: { name: true } } },
      });
      throw new ApiError(
        current?.preparateur?.name
          ? `Ce dossier est déjà pris en charge par ${current.preparateur.name}.`
          : "Ce dossier vient d'être pris en charge par un autre agent.",
        409,
      );
    }

    await tx.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "PREPARATION_PRISE_EN_CHARGE",
        ancienStatut: dossier.statutPreparation,
        nouveauStatut: "EN_COURS",
      },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "PREPARATION_CLAIM",
        entity: "DOSSIER",
        entityId: id,
        ipAddress,
      },
    });

    return tx.dossier.findUniqueOrThrow({ where: { id } });
  });
  return updated;
}

/**
 * Phase 20+ : nouvelle étape "Préparation", intercalée entre Validation et
 * Numérisation (cycle complet désormais Collecte -> Validation ->
 * Préparation -> Numérisation -> Indexation -> Archivage). L'opérateur y
 * renseigne nombrePieces/typesPieces/nombrePages — retirés de la Collecte
 * (cf. StepDossier.tsx/StepSuivi.tsx), car pas toujours connus sur le
 * terrain avant même la validation du dossier. `autresPieces` (Phase 21+)
 * a rejoint le lot pour la même raison. La cohérence des quantités et des
 * pages est contrôlée par le schéma ; une préparation valide passe donc
 * directement à TERMINE.
 */
export async function prepareDossier(
  id: number,
  data: PreparationInput
) {
  const session = await requireApiPermission("PREPARATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutValidation !== "VALIDE") {
    throw new ApiError(
      `Impossible de préparer : le dossier doit être "Validé" (statut actuel : ${dossier.statutValidation}).`
    );
  }
  if (dossier.statutPreparation === "A_VALIDER") {
    throw new ApiError("La préparation de ce dossier est déjà soumise, en attente de validation du superviseur.");
  }
  if (dossier.statutPreparation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà préparé.");
  }

  const cutoff = new Date(Date.now() - PREPARATION_CLAIM_TTL_MS);
  if (
    dossier.statutPreparation === "EN_COURS" &&
    dossier.preparateurId !== session.userId &&
    dossier.preparationClaimedAt &&
    dossier.preparationClaimedAt >= cutoff
  ) {
    const preparateur = dossier.preparateurId
      ? await prisma.user.findUnique({
          where: { id: dossier.preparateurId },
          select: { name: true },
        })
      : null;
    throw new ApiError(
      preparateur?.name
        ? `Ce dossier est déjà pris en charge par ${preparateur.name}.`
        : "Ce dossier est déjà pris en charge par un autre agent.",
      409,
    );
  }

  const pieceLines = await resolvePreparationPieceLines(data.pieceBreakdown);
  const nombrePieces = pieceLines.reduce((sum, line) => sum + line.nombrePieces, 0);
  const nombrePages = pieceLines.reduce((sum, line) => sum + line.nombrePages, 0);
  const ipAddress = await getClientIp();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.preparationPieceLine.deleteMany({ where: { dossierId: id } });
    await tx.preparationPieceLine.createMany({
      data: pieceLines.map((line) => ({
        dossierId: id,
        typePieceId: line.typePieceId,
        nombrePieces: line.nombrePieces,
        nombrePages: line.nombrePages,
        preparedById: session.userId,
      })),
    });

    const updated = await tx.dossier.update({
      where: { id },
      data: {
        statutPreparation: "TERMINE",
        preparateurId: session.userId,
        preparationClaimedAt: null,
        dateSoumissionPreparation: new Date(),
        datePreparation: new Date(),
        nombrePieces,
        nombrePages,
        ...(data.autresPieces !== undefined ? { autresPieces: data.autresPieces } : {}),
        ...(data.observationsPreparation !== undefined
          ? { observationsPreparation: data.observationsPreparation }
          : {}),
        typesPieces: { set: pieceLines.map((line) => ({ id: line.typePieceId })) },
      },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId: id,
        userId: session.userId,
        action: "PREPARATION_AUTOMATIQUE_VALIDEE",
        ancienStatut: dossier.statutPreparation,
        nouveauStatut: "TERMINE",
        commentaire: "Ventilation cohérente : préparation validée automatiquement.",
        metadata: {
          nombrePieces,
          nombrePages,
          ventilation: pieceLines.map((line) => ({
            typePiece: line.libelle,
            nombrePieces: line.nombrePieces,
            nombrePages: line.nombrePages,
          })),
        },
      },
    });
    await tx.workflowTransition.create({
      data: {
        dossierId: id,
        workflowType: "PREPARATION",
        fromStatus: dossier.statutPreparation,
        toStatus: "TERMINE",
        userId: null,
        commentaire: "Contrôles de ventilation conformes.",
      },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_PREPARE", entity: "DOSSIER", entityId: id, ipAddress },
    });

    return updated;
  });

  await advanceDossierAfterDocumentAvailable(id, session.userId, "PREPARATION_TERMINEE");
  return updated;
}

export async function validatePreparation(id: number, commentaire?: string) {
  const session = await requireApiPermission("PREPARATION_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutPreparation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : la préparation doit être "À valider" (statut actuel : ${dossier.statutPreparation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutPreparation: "TERMINE", datePreparation: now } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "PREPARATION_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "PREPARATION", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "PREPARATION_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectPreparation(id: number, commentaire: string) {
  const session = await requireApiPermission("PREPARATION_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutPreparation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : la préparation doit être "À valider" (statut actuel : ${dossier.statutPreparation}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutPreparation: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "PREPARATION_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "PREPARATION", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "PREPARATION_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function numerizeDossier(id: number, nombrePages?: number) {
  const session = await requireApiPermission("NUMERISATION_UPDATE");
  const dossier = await getDossierOr404(id);

  // Phase 20+ : la précondition était `statutValidation === "VALIDE"` ;
  // c'est désormais la Préparation (nouvelle étape intercalée) qui gate la
  // Numérisation. `statutPreparation` ne peut de toute façon atteindre
  // TERMINE que si le dossier a bien été VALIDÉ au préalable (cf.
  // prepareDossier ci-dessus) — même principe que indexDossier/
  // archiveDossier, qui ne vérifient que leur prédécesseur immédiat.
  if (dossier.statutPreparation !== "TERMINE") {
    throw new ApiError(
      `Impossible de numériser : le dossier doit être "Préparé" (statut actuel : ${dossier.statutPreparation}).`
    );
  }
  if (dossier.statutNumerisation === "A_VALIDER") {
    throw new ApiError("La numérisation de ce dossier est déjà soumise, en attente de validation du superviseur.");
  }
  if (dossier.statutNumerisation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà numérisé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const documentCount = await prisma.document.count({ where: { dossierId: id } });
  const targetStatus = documentCount > 0 ? "TERMINE" : "A_VALIDER";
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({
      where: { id },
      data: {
        statutNumerisation: targetStatus,
        dateNumerisation: targetStatus === "TERMINE" ? now : null,
        ...(nombrePages ? { nombrePages } : {}),
      },
    }),
    prisma.numerisation.create({
      data: {
        dossierId: id,
        operateurId,
        dateDebut: now,
        dateFin: now,
        nombrePages: nombrePages ?? dossier.nombrePages,
        statut: "TERMINEE",
      },
    }),
    prisma.dossierHistory.create({
      data: {
        dossierId: id,
        userId: targetStatus === "TERMINE" ? null : session.userId,
        action: targetStatus === "TERMINE" ? "NUMERISATION_AUTOMATIQUE_VALIDEE" : "NUMERISATION_ANOMALIE",
        ancienStatut: dossier.statutNumerisation,
        nouveauStatut: targetStatus,
        commentaire: targetStatus === "TERMINE"
          ? `${documentCount} fichier(s) disponible(s).`
          : "Aucun fichier numérique disponible.",
      },
    }),
    prisma.workflowTransition.create({
      data: {
        dossierId: id,
        workflowType: "NUMERISATION",
        fromStatus: dossier.statutNumerisation,
        toStatus: targetStatus,
        userId: targetStatus === "TERMINE" ? null : session.userId,
        commentaire: targetStatus === "TERMINE"
          ? "Validation automatique après présence d'un fichier."
          : "Exception : document numérique manquant.",
      },
    }),
    ...(targetStatus === "A_VALIDER"
      ? [
          prisma.qualityCheck.create({
            data: {
              dossierId: id,
              userId: null,
              typeControle: "CONTROLE_AUTOMATIQUE_NUMERISATION",
              score: 0,
              statut: "A_CORRIGER",
              nombreAnomalies: 1,
              commentaire: "La numérisation ne peut pas avancer sans fichier.",
              anomalies: {
                create: {
                  dossierId: id,
                  type: "DOCUMENT_MANQUANT",
                  champ: "documents",
                  gravite: "ELEVEE",
                  description: "Aucun fichier numérisé n'est associé au dossier.",
                },
              },
            },
          }),
        ]
      : []),
    prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "DOSSIER_NUMERIZE",
        entity: "DOSSIER",
        entityId: id,
        newValue: { targetStatus, documentCount },
        ipAddress: await getClientIp(),
      },
    }),
  ]);

  if (targetStatus === "TERMINE") {
    await reconcileDossierIndexation(id, session.userId);
  }
  return updated;
}

export async function validateNumerisation(id: number, commentaire?: string) {
  const session = await requireApiPermission("NUMERISATION_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutNumerisation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : la numérisation doit être "À valider" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }

  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutNumerisation: "TERMINE", dateNumerisation: now } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "NUMERISATION_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function rejectNumerisation(id: number, commentaire: string) {
  const session = await requireApiPermission("NUMERISATION_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutNumerisation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : la numérisation doit être "À valider" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutNumerisation: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "NUMERISATION_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "NUMERISATION", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "NUMERISATION_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function indexDossier(id: number, scoreQualite?: number) {
  const session = await requireApiPermission("INDEXATION_UPDATE");
  const dossier = await getDossierOr404(id);

  if (dossier.statutNumerisation !== "TERMINE") {
    throw new ApiError(
      `Impossible d'indexer : le dossier doit être "Numérisé" (statut actuel : ${dossier.statutNumerisation}).`
    );
  }
  if (dossier.statutIndexation === "A_VALIDER") {
    throw new ApiError("L'indexation de ce dossier est déjà soumise, en attente de validation du superviseur.");
  }
  if (dossier.statutIndexation === "TERMINE") {
    throw new ApiError("Ce dossier est déjà indexé.");
  }

  const documentCount = await prisma.document.count({ where: { dossierId: id } });
  if (documentCount === 0) {
    throw new ApiError("Aucun document numérisé n'est disponible pour l'indexation.");
  }

  const documentsACompleter = await prisma.document.count({
    where: {
      dossierId: id,
      OR: [
        { preIndexStatus: { not: "PRET" } },
        { automaticIndexStatus: { notIn: ["INDEXE", "A_REQUALIFIER"] } },
      ],
    },
  });
  if (documentsACompleter > 0) {
    throw new ApiError(
      `${documentsACompleter} document(s) attendent encore le traitement automatique avant de soumettre l'indexation.`,
    );
  }

  await reconcileDossierIndexation(id, session.userId);
  const updated = await getDossierOr404(id);
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "DOSSIER_INDEX",
      entity: "DOSSIER",
      entityId: id,
      newValue: { statutIndexation: updated.statutIndexation, scoreQualite },
      ipAddress: await getClientIp(),
    },
  });
  return updated;
}

export async function validateIndexation(id: number, commentaire?: string) {
  const session = await requireApiPermission("INDEXATION_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutIndexation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : l'indexation doit être "À valider" (statut actuel : ${dossier.statutIndexation}).`
    );
  }

  const documents = await prisma.document.findMany({
    where: { dossierId: id },
    select: { id: true, automaticIndexStatus: true, indexingConfidence: true },
  });
  if (documents.length === 0) {
    throw new ApiError("Impossible de valider l'indexation sans document numérisé.");
  }
  const stillProcessing = documents.filter(
    (document) => !["INDEXE", "A_REQUALIFIER"].includes(document.automaticIndexStatus),
  );
  if (stillProcessing.length > 0) {
    throw new ApiError(`${stillProcessing.length} document(s) sont encore en traitement ou en erreur.`);
  }

  const now = new Date();
  const confidenceValues = documents
    .map((document) => document.indexingConfidence ? Number(document.indexingConfidence) : null)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const scoreQualite = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : null;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.dossier.update({ where: { id }, data: { statutIndexation: "TERMINE", dateIndexation: now } });
    await tx.documentIndexValue.updateMany({
      where: { document: { dossierId: id, automaticIndexStatus: "A_REQUALIFIER" } },
      data: { validated: true },
    });
    await tx.document.updateMany({
      where: { dossierId: id, automaticIndexStatus: "A_REQUALIFIER" },
      data: {
        automaticIndexStatus: "INDEXE",
        preIndexStatus: "PRET",
        preIndexedBy: session.userId,
        preIndexedAt: now,
        indexedAt: now,
        lastIndexingError: null,
      },
    });
    await tx.anomalie.updateMany({
      where: {
        dossierId: id,
        statut: { in: ["OUVERTE", "EN_COURS"] },
        qualityCheck: { typeControle: "CONTROLE_AUTOMATIQUE_INDEXATION" },
      },
      data: { statut: "IGNOREE", corrigePar: session.userId, corrigeLe: now },
    });
    await tx.qualityCheck.updateMany({
      where: { dossierId: id, typeControle: "CONTROLE_AUTOMATIQUE_INDEXATION" },
      data: { statut: "CONFORME", commentaire: "Exception examinée et acceptée par le superviseur." },
    });
    await tx.indexation.create({
      data: {
        dossierId: id,
        operateurId: null,
        dateDebut: now,
        dateFin: now,
        statut: "TERMINEE",
        scoreQualite,
        commentaire: commentaire?.trim() || "Exception d'indexation validée par le superviseur.",
      },
    });
    await tx.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    });
    await tx.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "INDEXATION_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    });
    return result;
  });

  return updated;
}

export async function rejectIndexation(id: number, commentaire: string) {
  const session = await requireApiPermission("INDEXATION_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutIndexation !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : l'indexation doit être "À valider" (statut actuel : ${dossier.statutIndexation}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutIndexation: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "INDEXATION_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "INDEXATION", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "INDEXATION_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function archiveDossier(id: number, emplacement: string, referenceArchivage?: string) {
  const session = await requireApiPermission("ARCHIVAGE_UPDATE");
  if (!emplacement?.trim()) {
    throw new ApiError("L'emplacement d'archivage est requis.");
  }
  const dossier = await getDossierOr404(id);

  // Règle explicite du cahier des charges (§42) : un dossier ne peut pas être
  // ARCHIVÉ s'il n'est pas INDEXÉ.
  if (dossier.statutIndexation !== "TERMINE") {
    throw new ApiError(
      `Impossible d'archiver : le dossier doit être "Indexé" (statut actuel : ${dossier.statutIndexation}).`
    );
  }
  if (dossier.statutArchivage === "A_VALIDER") {
    throw new ApiError("L'archivage de ce dossier est déjà soumis, en attente de validation du superviseur.");
  }
  if (dossier.statutArchivage === "TERMINE") {
    throw new ApiError("Ce dossier est déjà archivé.");
  }

  const operateurId = await resolveOperateurId(session);
  const now = new Date();
  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "A_VALIDER" } }),
    prisma.archivage.create({
      data: {
        dossierId: id,
        operateurId,
        dateArchivage: now,
        emplacement,
        referenceArchivage,
        statut: "TERMINEE",
      },
    }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE", ancienStatut: dossier.statutArchivage, nouveauStatut: "A_VALIDER", commentaire: emplacement },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: dossier.statutArchivage, toStatus: "A_VALIDER", userId: session.userId },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "DOSSIER_ARCHIVE", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}

export async function validateArchivage(id: number, commentaire?: string) {
  const session = await requireApiPermission("ARCHIVAGE_VALIDATE");
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutArchivage !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de valider : l'archivage doit être "À valider" (statut actuel : ${dossier.statutArchivage}).`
    );
  }

  const now = new Date();
  const ipAddress = await getClientIp();
  const digitalArchiveEnabled = isAlfrescoDigitalArchiveEnabled();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.dossier.update({
      where: { id },
      data: { statutArchivage: "TERMINE", dateArchivage: now },
    });
    await tx.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE_VALIDATION", ancienStatut: "A_VALIDER", nouveauStatut: "TERMINE", commentaire },
    });
    await tx.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: "A_VALIDER", toStatus: "TERMINE", userId: session.userId, commentaire },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "ARCHIVAGE_VALIDATE", entity: "DOSSIER", entityId: id, ipAddress },
    });
    const queued = digitalArchiveEnabled
      ? await tx.document.updateMany({
          where: {
            dossierId: id,
            preIndexStatus: "PRET",
            digitalArchiveStatus: { not: "ARCHIVE" },
          },
          data: {
            digitalArchiveStatus: "EN_ATTENTE",
            alfrescoArchiveError: null,
          },
        })
      : { count: 0 };
    return { dossier: updated, queued: queued.count };
  });

  return {
    dossier: result.dossier,
    digitalArchive: {
      queued: result.queued,
      actorUserId: session.userId,
    },
  };
}

export async function rejectArchivage(id: number, commentaire: string) {
  const session = await requireApiPermission("ARCHIVAGE_REJECT");
  if (!commentaire?.trim()) {
    throw new ApiError("Un motif de rejet est requis.");
  }
  const dossier = await getDossierOr404(id);
  await assertSupervisorScope(session, dossier.operateurId);

  if (dossier.statutArchivage !== "A_VALIDER") {
    throw new ApiError(
      `Impossible de rejeter : l'archivage doit être "À valider" (statut actuel : ${dossier.statutArchivage}).`
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.dossier.update({ where: { id }, data: { statutArchivage: "REJETE" } }),
    prisma.dossierHistory.create({
      data: { dossierId: id, userId: session.userId, action: "ARCHIVAGE_REJET", ancienStatut: "A_VALIDER", nouveauStatut: "REJETE", commentaire },
    }),
    prisma.workflowTransition.create({
      data: { dossierId: id, workflowType: "ARCHIVAGE", fromStatus: "A_VALIDER", toStatus: "REJETE", userId: session.userId, commentaire },
    }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "ARCHIVAGE_REJECT", entity: "DOSSIER", entityId: id, ipAddress: await getClientIp() },
    }),
  ]);

  return updated;
}
