import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { ApiError } from "@/lib/utils/api-error";
import { reconcileDossierIndexation } from "@/lib/services/workflow-automation-service";
import {
  durationSeconds,
  ETAT_REMISE_LABELS,
  finishError,
  isTakeoverAllowed,
  type EtatRemise,
} from "@/lib/workflow/reconditionnement";

const OPEN = { finishedAt: null } as const;

function dossierLabel(dossier: { reference: string }) {
  return dossier.reference;
}

/**
 * L'agent commence un dossier : le chrono démarre. Il ne peut avoir qu'un
 * dossier ouvert à la fois ; un dossier commencé par un collègue il y a moins
 * de 2 h lui est réservé.
 */
export async function startReconditionnement(dossierId: number) {
  const session = await requireApiPermission("CONDITIONNEMENT_UPDATE");
  const ipAddress = await getClientIp();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const mine = await tx.reconditionnementSession.findFirst({
      where: { userId: session.userId, ...OPEN },
      select: { dossierId: true, dossier: { select: { reference: true } } },
    });
    if (mine && mine.dossierId !== dossierId) {
      throw new ApiError(`Terminez ou libérez d'abord le dossier ${dossierLabel(mine.dossier)}.`, 409);
    }
    if (mine) return { dossierId, alreadyStarted: true };

    const [dossier] = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM dossiers WHERE id = ${dossierId} FOR UPDATE`;
    if (!dossier) throw new ApiError("Dossier introuvable.", 404);
    const current = await tx.dossier.findUniqueOrThrow({
      where: { id: dossierId },
      select: { reference: true, statutNumerisation: true, statutConditionnement: true },
    });
    if (current.statutNumerisation !== "TERMINE") throw new ApiError("Ce dossier n'est pas encore numérisé.", 409);
    if (current.statutConditionnement === "TERMINE") throw new ApiError("Ce dossier est déjà reconditionné.", 409);

    const other = await tx.reconditionnementSession.findFirst({
      where: { dossierId, ...OPEN },
      select: { id: true, startedAt: true, user: { select: { name: true } } },
    });
    if (other) {
      if (!isTakeoverAllowed(other.startedAt, now)) throw new ApiError(`${other.user.name} reconditionne déjà ce dossier.`, 409);
      // Session oubliée : on la ferme sans temps comptabilisé.
      await tx.reconditionnementSession.update({ where: { id: other.id }, data: { finishedAt: now, abandoned: true } });
    }

    await tx.reconditionnementSession.create({ data: { dossierId, userId: session.userId, startedAt: now } });
    await tx.dossier.update({
      where: { id: dossierId },
      data: { statutConditionnement: "EN_COURS", conditionneurId: session.userId, conditionnementClaimedAt: now },
    });
    await tx.dossierHistory.create({
      data: {
        dossierId,
        userId: session.userId,
        action: "CONDITIONNEMENT_DOSSIER_DEBUT",
        ancienStatut: current.statutConditionnement,
        nouveauStatut: "EN_COURS",
        commentaire: other ? `Repris après ${other.user.name} (session de plus de 2 h).` : "Reconditionnement commencé.",
      },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "CONDITIONNEMENT_DOSSIER_START", entity: "DOSSIER", entityId: dossierId, ipAddress },
    });
    return { dossierId, alreadyStarted: false };
  });
}

/** L'agent répond à la question de fin : le temps est enregistré et le dossier part à l'indexation. */
export async function finishReconditionnement(dossierId: number, etat: EtatRemise, observations?: string) {
  const session = await requireApiPermission("CONDITIONNEMENT_UPDATE");
  const error = finishError(etat, observations);
  if (error) throw new ApiError(error, 400);
  const note = observations?.trim() || null;
  const ipAddress = await getClientIp();
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const open = await tx.reconditionnementSession.findFirst({
      where: { dossierId, userId: session.userId, ...OPEN },
      select: { id: true, startedAt: true },
    });
    if (!open) throw new ApiError("Commencez d'abord ce dossier : aucun reconditionnement en cours à votre nom.", 409);
    const seconds = durationSeconds(open.startedAt, now);
    const closed = await tx.reconditionnementSession.updateMany({
      where: { id: open.id, finishedAt: null },
      data: { finishedAt: now, durationSeconds: seconds, etatRemise: etat, observations: note },
    });
    if (closed.count !== 1) throw new ApiError("Ce reconditionnement a déjà été clôturé. Rechargez la page.", 409);
    const comment = note ? `${ETAT_REMISE_LABELS[etat]} : ${note}` : ETAT_REMISE_LABELS[etat];
    await tx.dossier.update({
      where: { id: dossierId },
      data: {
        statutConditionnement: "TERMINE",
        conditionneurId: session.userId,
        conditionnementClaimedAt: null,
        dateConditionnement: now,
        observationsConditionnement: comment,
      },
    });
    await tx.dossierHistory.create({
      data: { dossierId, userId: session.userId, action: "CONDITIONNEMENT_DOSSIER_TERMINE", ancienStatut: "EN_COURS", nouveauStatut: "TERMINE", commentaire: comment },
    });
    await tx.workflowTransition.create({
      data: { dossierId, workflowType: "CONDITIONNEMENT", fromStatus: "EN_COURS", toStatus: "TERMINE", userId: session.userId, commentaire: comment },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId, action: "CONDITIONNEMENT_DOSSIER_COMPLETE", entity: "DOSSIER", entityId: dossierId,
        newValue: { durationSeconds: seconds, etatRemise: etat }, ipAddress,
      },
    });
    return { dossierId, durationSeconds: seconds };
  });
  await reconcileDossierIndexation(dossierId, session.userId);
  return result;
}

/** L'agent rend le dossier sans le finir : le temps n'est pas compté, un collègue peut le reprendre. */
export async function releaseReconditionnement(dossierId: number) {
  const session = await requireApiPermission("CONDITIONNEMENT_UPDATE");
  const ipAddress = await getClientIp();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const closed = await tx.reconditionnementSession.updateMany({
      where: { dossierId, userId: session.userId, ...OPEN },
      data: { finishedAt: now, abandoned: true },
    });
    if (closed.count === 0) throw new ApiError("Aucun reconditionnement en cours à votre nom sur ce dossier.", 409);
    await tx.dossier.updateMany({
      where: { id: dossierId, statutConditionnement: "EN_COURS", conditionneurId: session.userId },
      data: { statutConditionnement: "EN_ATTENTE", conditionneurId: null, conditionnementClaimedAt: null },
    });
    await tx.dossierHistory.create({
      data: { dossierId, userId: session.userId, action: "CONDITIONNEMENT_DOSSIER_LIBERE", ancienStatut: "EN_COURS", nouveauStatut: "EN_ATTENTE", commentaire: "Dossier libéré sans être terminé." },
    });
    await tx.auditLog.create({
      data: { userId: session.userId, action: "CONDITIONNEMENT_DOSSIER_RELEASE", entity: "DOSSIER", entityId: dossierId, ipAddress },
    });
    return { dossierId };
  });
}
