import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { assertEmailConfigured, getApplicationUrl, sendTransactionalEmail } from "@/lib/email/resend";
import { renderStatisticsReportEmail, type StatisticsReportSnapshot } from "@/lib/email/statistics-report-template";
import { computeNextEmailReportAt, type EmailReportFrequency } from "@/lib/email/report-schedule";
import { getAcceptedOperatorActivity, getSupervisorDecisionKind } from "@/lib/utils/finance-points";

const ELIGIBLE_ROLES = ["EXECUTIF", "SUPERVISEUR"] as const;
const DELIVERY_LIMIT = 30;

export interface EmailReportConfigurationInput {
  userId: number;
  frequency: EmailReportFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  hourUtc: number;
  includePoints: boolean;
  isActive: boolean;
}

function dossierScope(operateurIds: number[] | null): Prisma.DossierWhereInput {
  if (operateurIds === null) return {};
  return operateurIds.length > 0 ? { operateurId: { in: operateurIds } } : { operateurId: -1 };
}

function currentMonthPeriod(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  return { start, end, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

async function buildReportSnapshot(user: { id: number; name: string; role: { code: string } }, includePoints: boolean): Promise<StatisticsReportSnapshot> {
  const generatedAt = new Date();
  const isSupervisor = user.role.code === "SUPERVISEUR";
  const operateurIds = isSupervisor
    ? (await prisma.operateur.findMany({ where: { supervisorId: user.id }, select: { id: true } })).map((row) => row.id)
    : null;
  const where = dossierScope(operateurIds);
  const period = currentMonthPeriod(generatedAt);

  const [total, soumis, enControle, valides, rejetes, numerises, indexes, archives, activeTeamMembers, transitions, supervisorUsers] = await Promise.all([
    prisma.dossier.count({ where }),
    prisma.dossier.count({ where: { ...where, statutCollecte: "SOUMIS" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "EN_CONTROLE" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "VALIDE" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "REJETE" } }),
    prisma.dossier.count({ where: { ...where, statutNumerisation: "TERMINE" } }),
    prisma.dossier.count({ where: { ...where, statutIndexation: "TERMINE" } }),
    prisma.dossier.count({ where: { ...where, statutArchivage: "TERMINE" } }),
    prisma.operateur.count({ where: isSupervisor ? { id: { in: operateurIds ?? [] }, isActive: true } : { isActive: true } }),
    prisma.workflowTransition.findMany({
      where: {
        createdAt: { gte: period.start, lt: period.end },
        ...(operateurIds === null ? {} : { dossier: dossierScope(operateurIds) }),
        OR: [
          { workflowType: "VALIDATION", toStatus: { in: ["VALIDE", "REJETE"] } },
          { workflowType: "NUMERISATION", toStatus: { in: ["TERMINE", "REJETE"] } },
          { workflowType: "INDEXATION", toStatus: { in: ["TERMINE", "REJETE"] } },
          { workflowType: "ARCHIVAGE", toStatus: { in: ["TERMINE", "REJETE"] } },
        ],
      },
      select: { dossierId: true, workflowType: true, toStatus: true, userId: true },
    }),
    isSupervisor
      ? Promise.resolve([{ id: user.id }])
      : prisma.user.findMany({ where: { role: { code: "SUPERVISEUR" } }, select: { id: true } }),
  ]);

  const creditedStages = new Set<string>();
  let operatorPoints = 0;
  const supervisorIds = new Set(supervisorUsers.map((entry) => entry.id));
  let supervisorPoints = 0;
  for (const transition of transitions) {
    const activity = getAcceptedOperatorActivity(transition);
    if (activity) {
      const key = `${transition.dossierId}:${activity}`;
      if (!creditedStages.has(key)) {
        creditedStages.add(key);
        operatorPoints++;
      }
    }
    if (transition.userId && supervisorIds.has(transition.userId) && getSupervisorDecisionKind(transition)) {
      supervisorPoints++;
    }
  }

  const attention: string[] = [];
  if (isSupervisor && activeTeamMembers === 0) attention.push("Aucun opérateur actif n'est affecté à votre périmètre.");
  if (enControle > 0) attention.push(`${enControle} dossier${enControle > 1 ? "s" : ""} en attente de contrôle.`);
  if (rejetes > 0) attention.push(`${rejetes} dossier${rejetes > 1 ? "s" : ""} rejeté${rejetes > 1 ? "s" : ""} à corriger.`);
  const awaitingDigitization = Math.max(0, valides - numerises);
  if (awaitingDigitization > 0) attention.push(`${awaitingDigitization} dossier${awaitingDigitization > 1 ? "s" : ""} validé${awaitingDigitization > 1 ? "s" : ""} en attente de numérisation.`);
  const awaitingIndexing = Math.max(0, numerises - indexes);
  if (awaitingIndexing > 0) attention.push(`${awaitingIndexing} dossier${awaitingIndexing > 1 ? "s" : ""} numérisé${awaitingIndexing > 1 ? "s" : ""} en attente d'indexation.`);

  return {
    recipientName: user.name,
    scopeLabel: isSupervisor ? `Équipe de ${user.name}` : "Vue exécutive globale",
    generatedAt,
    dashboardUrl: `${getApplicationUrl()}${isSupervisor ? "/dashboard/operateurs" : "/dashboard/direction"}`,
    periodLabel: period.label,
    includePoints,
    teamMembers: activeTeamMembers,
    pipeline: { total, soumis, enControle, valides, rejetes, numerises, indexes, archives },
    points: { operateurs: operatorPoints, superviseur: supervisorPoints, total: operatorPoints + supervisorPoints },
    attention,
  };
}

export async function listEmailReportAdministration() {
  await requirePermission("SETTINGS_MANAGE");
  let emailConfigured = true;
  try {
    assertEmailConfigured();
  } catch {
    emailConfigured = false;
  }
  const [users, deliveries] = await Promise.all([
    prisma.user.findMany({
      where: { role: { code: { in: [...ELIGIBLE_ROLES] } } },
      orderBy: [{ role: { code: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        role: { select: { code: true, name: true } },
        emailReportSubscription: true,
        _count: { select: { supervisedOperateurs: true } },
      },
    }),
    prisma.emailReportDelivery.findMany({
      orderBy: { createdAt: "desc" },
      take: DELIVERY_LIMIT,
      select: {
        id: true,
        status: true,
        triggerType: true,
        sentAt: true,
        createdAt: true,
        errorMessage: true,
        recipient: { select: { name: true, email: true } },
      },
    }),
  ]);
  return { users, deliveries, emailConfigured };
}

export async function saveEmailReportConfiguration(input: EmailReportConfigurationInput, actorId: number) {
  const user = await prisma.user.findFirst({
    where: { id: input.userId, role: { code: { in: [...ELIGIBLE_ROLES] } } },
    select: { id: true, name: true, email: true, isActive: true, role: { select: { code: true } } },
  });
  if (!user) throw new Error("Seuls les comptes Exécutif et Superviseur peuvent recevoir ce rapport.");
  if (input.isActive && !user.isActive) throw new Error("Réactivez ce compte avant de programmer un rapport.");
  if (input.isActive) assertEmailConfigured();

  const nextSendAt = computeNextEmailReportAt(input);
  const before = await prisma.emailReportSubscription.findUnique({ where: { userId: user.id } });
  const subscription = await prisma.emailReportSubscription.upsert({
    where: { userId: user.id },
    create: { ...input, nextSendAt, createdById: actorId },
    update: {
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hourUtc: input.hourUtc,
      includePoints: input.includePoints,
      isActive: input.isActive,
      nextSendAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: before ? "EMAIL_REPORT_SUBSCRIPTION_UPDATE" : "EMAIL_REPORT_SUBSCRIPTION_CREATE",
      entity: "EMAIL_REPORT_SUBSCRIPTION",
      entityId: subscription.id,
      oldValue: before ? { frequency: before.frequency, isActive: before.isActive } : undefined,
      newValue: { recipientUserId: user.id, role: user.role.code, frequency: subscription.frequency, includePoints: subscription.includePoints, isActive: subscription.isActive },
    },
  });
  return subscription;
}

async function deliverReport(subscriptionId: number, triggerType: "MANUAL" | "SCHEDULED", triggeredById: number | null, scheduledFor: Date, idempotencyKey: string) {
  const subscription = await prisma.emailReportSubscription.findUnique({
    where: { id: subscriptionId },
    include: { user: { select: { id: true, name: true, email: true, isActive: true, role: { select: { code: true } } } } },
  });
  if (!subscription) throw new Error("Configuration de rapport introuvable.");
  if (!subscription.user.isActive || !ELIGIBLE_ROLES.includes(subscription.user.role.code as (typeof ELIGIBLE_ROLES)[number])) {
    await prisma.emailReportSubscription.update({ where: { id: subscription.id }, data: { isActive: false } });
    throw new Error("Le destinataire est inactif ou son rôle n'est plus autorisé.");
  }

  const delivery = await prisma.emailReportDelivery.create({
    data: {
      subscriptionId: subscription.id,
      recipientUserId: subscription.user.id,
      triggeredById,
      triggerType,
      scheduledFor,
      idempotencyKey,
    },
  });

  try {
    const snapshot = await buildReportSnapshot(subscription.user, subscription.includePoints);
    const message = renderStatisticsReportEmail(snapshot);
    const providerMessageId = await sendTransactionalEmail({
      idempotencyKey,
      to: subscription.user.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const sentAt = new Date();
    await prisma.$transaction([
      prisma.emailReportDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", providerMessageId, sentAt } }),
      prisma.emailReportSubscription.update({ where: { id: subscription.id }, data: { lastSentAt: sentAt } }),
    ]);
    return { deliveryId: delivery.id, providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Erreur d'envoi inconnue.";
    await prisma.emailReportDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", errorMessage: message } });
    throw error;
  }
}

export async function sendEmailReportNow(userId: number, actorId: number) {
  const subscription = await prisma.emailReportSubscription.findUnique({ where: { userId } });
  if (!subscription) throw new Error("Enregistrez d'abord la configuration de ce destinataire.");
  return deliverReport(subscription.id, "MANUAL", actorId, new Date(), `geoarchives-manual-${subscription.id}-${randomUUID()}`);
}

export async function processDueEmailReports(now = new Date()) {
  const due = await prisma.emailReportSubscription.findMany({
    where: { isActive: true, nextSendAt: { lte: now } },
    orderBy: { nextSendAt: "asc" },
    take: 20,
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const subscription of due) {
    const scheduledFor = subscription.nextSendAt;
    const nextSendAt = computeNextEmailReportAt({
      frequency: subscription.frequency as EmailReportFrequency,
      dayOfWeek: subscription.dayOfWeek,
      dayOfMonth: subscription.dayOfMonth,
      hourUtc: subscription.hourUtc,
    }, now);
    const claimed = await prisma.emailReportSubscription.updateMany({
      where: { id: subscription.id, isActive: true, nextSendAt: scheduledFor },
      data: { nextSendAt },
    });
    if (claimed.count === 0) {
      skipped++;
      continue;
    }

    try {
      await deliverReport(
        subscription.id,
        "SCHEDULED",
        null,
        scheduledFor,
        `geoarchives-scheduled-${subscription.id}-${scheduledFor.getTime()}`,
      );
      sent++;
    } catch (error) {
      console.error("Scheduled statistics email failed.", {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      failed++;
    }
  }
  return { due: due.length, sent, failed, skipped };
}
