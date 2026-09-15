import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { PasswordResetPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { getApplicationUrl, sendPasswordAccessEmail } from "@/lib/email/resend";
import { hashPassword } from "@/lib/auth/password";

export const PASSWORD_RESET_TTL_MINUTES = 60;

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Ce lien est invalide, expiré ou a déjà été utilisé.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issuePasswordAccessEmail({
  user,
  purpose,
}: {
  user: { id: number; name: string; email: string };
  purpose: PasswordResetPurpose;
}): Promise<{ emailId: string; tokenId: number }> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  const baseUrl = getApplicationUrl();
  const resetUrl = new URL("/reinitialiser-mot-de-passe", baseUrl);
  resetUrl.searchParams.set("token", rawToken);

  const tokenRecord = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({
      where: {
        OR: [
          { userId: user.id, usedAt: null },
          { expiresAt: { lte: new Date() } },
        ],
      },
    });

    return tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash, purpose, expiresAt },
    });
  });

  try {
    const emailId = await sendPasswordAccessEmail({
      idempotencyKey: `password-access-${tokenRecord.id}`,
      name: user.name,
      email: user.email,
      resetUrl: resetUrl.toString(),
      purpose,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
    return { emailId, tokenId: tokenRecord.id };
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { id: tokenRecord.id, usedAt: null } });
    throw error;
  }
}

export async function resetPasswordWithToken({
  token,
  newPassword,
  ipAddress,
}: {
  token: string;
  newPassword: string;
  ipAddress: string;
}): Promise<void> {
  const tokenHash = hashResetToken(token);
  const now = new Date();
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, isActive: true } } },
  });

  if (!record || record.usedAt || record.expiresAt <= now || !record.user.isActive) {
    throw new InvalidPasswordResetTokenError();
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new InvalidPasswordResetTokenError();

    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({
      where: { userId: record.userId, id: { not: record.id } },
    });
    await tx.auditLog.create({
      data: {
        userId: record.userId,
        action: "PASSWORD_RESET_LINK",
        entity: "USER",
        entityId: record.userId,
        ipAddress,
      },
    });
  });
}
