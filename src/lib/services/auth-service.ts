"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma/client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { signSession, COOKIE_NAME, SESSION_DURATION_SECONDS } from "@/lib/auth/session";
import { isRateLimited, registerFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";
import { loginSchema, changePasswordSchema } from "@/lib/validation/auth";
import { getSession, requireUser } from "@/lib/auth/current-user";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";

export interface LoginFormState {
  error?: string;
}

async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

export async function loginAction(_prevState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "E-mail ou mot de passe invalide." };
  }

  const { email, password } = parsed.data;
  const ip = await getClientIp();
  const rateLimitKey = `${email.toLowerCase()}:${ip}`;

  if (isRateLimited(rateLimitKey)) {
    return { error: "Trop de tentatives échouées. Réessayez dans quelques minutes." };
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });

  // Message volontairement générique (ne pas révéler si l'e-mail existe ou non).
  const genericError = "Identifiants incorrects.";

  if (!user || !user.isActive) {
    registerFailedAttempt(rateLimitKey);
    return { error: genericError };
  }

  const validPassword = await verifyPassword(password, user.passwordHash);
  if (!validPassword) {
    registerFailedAttempt(rateLimitKey);
    await prisma.auditLog.create({
      data: { userId: user.id, action: "LOGIN_FAILED", entity: "USER", entityId: user.id, ipAddress: ip },
    });
    return { error: genericError };
  }

  clearAttempts(rateLimitKey);

  const permissions = user.role.rolePermissions.map((rp) => rp.permission.code) as PermissionCode[];

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    roleCode: user.role.code as RoleCode,
    permissions,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: { userId: user.id, action: "LOGIN", entity: "USER", entityId: user.id, ipAddress: ip },
    }),
  ]);

  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  const ip = await getClientIp();
  const store = await cookies();
  store.delete(COOKIE_NAME);

  if (session) {
    await prisma.auditLog.create({
      data: { userId: session.userId, action: "LOGOUT", entity: "USER", entityId: session.userId, ipAddress: ip },
    });
  }

  redirect("/login");
}

export interface ChangePasswordFormState {
  error?: string;
  success?: boolean;
}

/**
 * Changement de mot de passe self-service (Phase 15) — n'importe quel
 * utilisateur connecté change son propre mot de passe (contrairement à
 * `scripts/create-user.ts`, réservé à un opérateur ayant un accès direct à
 * la base). Revérifie le mot de passe actuel côté serveur avant tout
 * changement — jamais de confiance dans le seul état du formulaire.
 */
export async function changePasswordAction(
  _prevState: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  const session = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return { error: "Utilisateur introuvable." };
  }

  const validCurrent = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!validCurrent) {
    return { error: "Le mot de passe actuel est incorrect." };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const ip = await getClientIp();

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: { userId: user.id, action: "PASSWORD_CHANGE", entity: "USER", entityId: user.id, ipAddress: ip },
    }),
  ]);

  return { success: true };
}
