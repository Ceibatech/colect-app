"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { financeRateSchema } from "@/lib/validation/finance";
import { getClientIp } from "@/lib/utils/server-request";

export interface FinanceRateActionResult {
  success?: boolean;
  error?: string;
  message?: string;
}

class FinanceRateRuleError extends Error {}

export async function createFinanceRate(
  _previousState: FinanceRateActionResult,
  formData: FormData,
): Promise<FinanceRateActionResult> {
  const session = await requirePermission("FINANCE_CONFIGURE");
  const parsed = financeRateSchema.safeParse({
    operatorPointValue: formData.get("operatorPointValue"),
    supervisorPointValue: formData.get("supervisorPointValue"),
    currency: formData.get("currency"),
    effectiveFrom: formData.get("effectiveFrom"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Barème invalide." };

  const effectiveFrom = new Date(`${parsed.data.effectiveFrom}T00:00:00.000Z`);
  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const latest = await tx.financeRate.findFirst({ orderBy: { effectiveFrom: "desc" } });
      if (latest) {
        if (parsed.data.currency !== latest.currency) {
          throw new FinanceRateRuleError(`La devise du registre est verrouillée sur ${latest.currency}.`);
        }
        const now = new Date();
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if (effectiveFrom < todayUtc) {
          throw new FinanceRateRuleError("Un nouveau barème ne peut pas modifier une période déjà écoulée.");
        }
        if (effectiveFrom <= latest.effectiveFrom) {
          throw new FinanceRateRuleError(`La date doit être postérieure au dernier barème (${latest.effectiveFrom.toLocaleDateString("fr-FR", { timeZone: "UTC" })}).`);
        }
        await tx.financeRate.update({ where: { id: latest.id }, data: { effectiveTo: effectiveFrom } });
      }

      const created = await tx.financeRate.create({
        data: {
          operatorPointValue: parsed.data.operatorPointValue,
          supervisorPointValue: parsed.data.supervisorPointValue,
          currency: parsed.data.currency,
          effectiveFrom,
          createdById: session.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "FINANCE_RATE_CREATE",
          entity: "FINANCE_RATE",
          entityId: created.id,
          newValue: {
            operatorPointValue: parsed.data.operatorPointValue,
            supervisorPointValue: parsed.data.supervisorPointValue,
            currency: parsed.data.currency,
            effectiveFrom: parsed.data.effectiveFrom,
          },
          ipAddress: ip,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof FinanceRateRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre barème vient d'être enregistré. Actualisez la page puis réessayez." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Un barème existe déjà à cette date." };
    }
    console.error("Finance rate creation failed.", error);
    return { error: "Le barème n'a pas pu être enregistré." };
  }

  revalidatePath("/dashboard/finance");
  return { success: true, message: "Le nouveau barème est planifié." };
}