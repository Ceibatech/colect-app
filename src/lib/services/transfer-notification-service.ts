import "server-only";

import { Prisma } from "@prisma/client";
import { getApplicationUrl, sendTransactionalEmail } from "@/lib/email/resend";
import { renderTransferNotificationEmail, type TransferNotificationEmailInput } from "@/lib/email/transfer-notification-template";
import type { RoleCode } from "@/lib/permissions/constants";
import { prisma } from "@/lib/prisma/client";

export type TransferEmailEvent =
  | "LOT_SUBMITTED"
  | "LOT_CEIBA_VALIDATED"
  | "AUTHORIZATION_F01_READY"
  | "MOVEMENT_SUBMITTED_CEIBA"
  | "MOVEMENT_SUBMITTED_MINISTRY"
  | "MOVEMENT_CEIBA_VALIDATED"
  | "MOVEMENT_SIGNED"
  | "MOVEMENT_INCIDENT_REPORTED";

interface TransferWorkflowNotification {
  event: TransferEmailEvent;
  entityType: "TRANSFER_LOT" | "TRANSFER_MOVEMENT" | "TRANSFER_OPERATION";
  entityId: number;
  recipientRoleCodes: RoleCode[];
  recipientUserIds?: number[];
  title: string;
  message: string;
  reference: string;
  statusLabel: string;
  actionPath: string;
  actionLabel: string;
  documentPath?: string;
  documentLabel?: string;
  details?: Array<{ label: string; value: string }>;
  alert?: boolean;
}

export interface TransferNotificationResult {
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface StoredTransferNotification {
  recipientName: string;
  title: string;
  message: string;
  reference: string;
  statusLabel: string;
  actionPath: string;
  actionLabel: string;
  documentPath?: string;
  documentLabel?: string;
  details?: Array<{ label: string; value: string }>;
  alert?: boolean;
}

const MAX_DELIVERY_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [1, 5, 20, 60, 180] as const;

function absoluteUrl(path: string, applicationUrl: string): string {
  return new URL(path, `${applicationUrl}/`).toString();
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "Erreur d'envoi inconnue.").slice(0, 1000);
}

function asJson(value: StoredTransferNotification): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nextAttemptDate(attemptCount: number): Date | null {
  if (attemptCount >= MAX_DELIVERY_ATTEMPTS) return null;
  const delayMinutes = RETRY_DELAYS_MINUTES[Math.min(attemptCount - 1, RETRY_DELAYS_MINUTES.length - 1)];
  return new Date(Date.now() + delayMinutes * 60_000);
}

async function deliverTransferEmail(deliveryId: number): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  const now = new Date();
  const claimed = await prisma.transferEmailDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    data: { status: "SENDING", attemptCount: { increment: 1 }, lastAttemptAt: now },
  });
  if (claimed.count === 0) return "SKIPPED";

  const delivery = await prisma.transferEmailDelivery.findUnique({
    where: { id: deliveryId },
    include: { recipient: { select: { email: true, isActive: true } } },
  });
  if (!delivery || !delivery.recipient.isActive) {
    if (delivery) {
      await prisma.transferEmailDelivery.update({
        where: { id: delivery.id },
        data: { status: "CANCELLED", errorMessage: "Le compte destinataire est inactif.", nextAttemptAt: null },
      });
    }
    return "FAILED";
  }

  try {
    const payload = delivery.payload as unknown as StoredTransferNotification;
    const applicationUrl = getApplicationUrl();
    const templateInput: TransferNotificationEmailInput = {
      recipientName: payload.recipientName,
      title: payload.title,
      message: payload.message,
      reference: payload.reference,
      statusLabel: payload.statusLabel,
      actionUrl: absoluteUrl(payload.actionPath, applicationUrl),
      actionLabel: payload.actionLabel,
      documentUrl: payload.documentPath ? absoluteUrl(payload.documentPath, applicationUrl) : undefined,
      documentLabel: payload.documentLabel,
      details: payload.details,
      alert: payload.alert,
    };
    const message = renderTransferNotificationEmail(templateInput);
    const providerMessageId = await sendTransactionalEmail({
      idempotencyKey: delivery.idempotencyKey,
      to: delivery.recipient.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    await prisma.transferEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", providerMessageId, sentAt: new Date(), nextAttemptAt: null, errorMessage: null },
    });
    return "SENT";
  } catch (error) {
    const nextAttemptAt = nextAttemptDate(delivery.attemptCount);
    await prisma.transferEmailDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", errorMessage: errorMessage(error), nextAttemptAt },
    }).catch((updateError) => console.error("Transfer email failure could not be recorded.", { deliveryId, updateError }));
    console.error("Transfer email delivery failed.", { deliveryId, event: delivery.eventType, entityId: delivery.entityId, recipientUserId: delivery.recipientUserId, error });
    return "FAILED";
  }
}

export async function notifyTransferWorkflow(input: TransferWorkflowNotification): Promise<TransferNotificationResult> {
  const recipientUserIds = [...new Set(input.recipientUserIds ?? [])];
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { code: { in: input.recipientRoleCodes } } },
        ...(recipientUserIds.length ? [{ id: { in: recipientUserIds } }] : []),
      ],
    },
    select: { id: true, name: true, email: true },
    orderBy: { id: "asc" },
  });

  const result: TransferNotificationResult = { recipients: recipients.length, sent: 0, failed: 0, skipped: 0 };
  for (const recipient of recipients) {
    const idempotencyKey = `geoarchives-transfer-${input.event}-${input.entityType}-${input.entityId}-${recipient.id}`.toLowerCase();
    let deliveryId: number;
    try {
      const delivery = await prisma.transferEmailDelivery.create({
        data: {
          recipientUserId: recipient.id,
          eventType: input.event,
          entityType: input.entityType,
          entityId: input.entityId,
          idempotencyKey,
          payload: asJson({
            recipientName: recipient.name,
            title: input.title,
            message: input.message,
            reference: input.reference,
            statusLabel: input.statusLabel,
            actionPath: input.actionPath,
            actionLabel: input.actionLabel,
            documentPath: input.documentPath,
            documentLabel: input.documentLabel,
            details: input.details,
            alert: input.alert,
          }),
        },
        select: { id: true },
      });
      deliveryId = delivery.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        result.skipped++;
        continue;
      }
      console.error("Transfer email delivery could not be registered.", { event: input.event, entityId: input.entityId, recipientUserId: recipient.id, error });
      result.failed++;
      continue;
    }

    const deliveryResult = await deliverTransferEmail(deliveryId);
    if (deliveryResult === "SENT") result.sent++;
    else if (deliveryResult === "FAILED") result.failed++;
    else result.skipped++;
  }

  return result;
}

export async function processPendingTransferEmails(now = new Date()): Promise<TransferNotificationResult & { due: number }> {
  const due = await prisma.transferEmailDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attemptCount: { lt: MAX_DELIVERY_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: { id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  const result = { due: due.length, recipients: due.length, sent: 0, failed: 0, skipped: 0 };
  for (const delivery of due) {
    const deliveryResult = await deliverTransferEmail(delivery.id);
    if (deliveryResult === "SENT") result.sent++;
    else if (deliveryResult === "FAILED") result.failed++;
    else result.skipped++;
  }
  return result;
}
