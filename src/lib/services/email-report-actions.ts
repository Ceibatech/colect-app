"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { EMAIL_REPORT_FREQUENCIES } from "@/lib/email/report-schedule";
import { saveEmailReportConfiguration, sendEmailReportNow } from "@/lib/services/email-report-service";

export interface EmailReportActionResult {
  success?: boolean;
  message?: string;
  error?: string;
}

const configurationSchema = z.object({
  userId: z.coerce.number().int().positive(),
  frequency: z.enum(EMAIL_REPORT_FREQUENCIES),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  dayOfMonth: z.coerce.number().int().min(1).max(28),
  hourUtc: z.coerce.number().int().min(0).max(23),
  includePoints: z.boolean(),
  isActive: z.boolean(),
});

export async function updateEmailReportConfiguration(
  _previous: EmailReportActionResult,
  formData: FormData,
): Promise<EmailReportActionResult> {
  const session = await requirePermission("SETTINGS_MANAGE");
  const parsed = configurationSchema.safeParse({
    userId: formData.get("userId"),
    frequency: formData.get("frequency"),
    dayOfWeek: formData.get("dayOfWeek") ?? 1,
    dayOfMonth: formData.get("dayOfMonth") ?? 1,
    hourUtc: formData.get("hourUtc") ?? 7,
    includePoints: formData.get("includePoints") === "on",
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Configuration invalide." };

  try {
    await saveEmailReportConfiguration(parsed.data, session.userId);
    revalidatePath("/administration/rapports-email");
    return { success: true, message: "Programmation enregistrée." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

export async function sendEmailReportNowAction(
  _previous: EmailReportActionResult,
  formData: FormData,
): Promise<EmailReportActionResult> {
  const session = await requirePermission("SETTINGS_MANAGE");
  const userId = z.coerce.number().int().positive().safeParse(formData.get("userId"));
  if (!userId.success) return { error: "Destinataire invalide." };

  try {
    const result = await sendEmailReportNow(userId.data, session.userId);
    revalidatePath("/administration/rapports-email");
    return { success: true, message: `Rapport envoyé (journal n° ${result.deliveryId}).` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Envoi impossible." };
  }
}
