import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken, type SessionPayload } from "@/lib/auth/session";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";
import { ApiError } from "@/lib/utils/api-error";
import { prisma } from "@/lib/prisma/client";

/**
 * Lit et vérifie la session depuis le cookie httpOnly. `cache()` évite de
 * revérifier le JWT plusieurs fois pour un même rendu de page (plusieurs
 * Server Components peuvent appeler getSession()).
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const tokenSession = await verifySessionToken(token);
  if (!tokenSession) return null;

  // Le JWT prouve l'origine de la session, mais l'état courant du compte et
  // les autorisations restent ceux de la base. Cela révoque immédiatement une
  // session après désactivation, changement de rôle ou rotation du mot de passe.
  const user = await prisma.user.findUnique({
    where: { id: tokenSession.userId },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      sessionVersion: true,
      role: {
        select: {
          code: true,
          rolePermissions: { select: { permission: { select: { code: true } } } },
        },
      },
    },
  });

  if (!user?.isActive || user.sessionVersion !== tokenSession.sessionVersion) return null;

  return {
    ...tokenSession,
    userId: user.id,
    email: user.email,
    name: user.name,
    roleCode: user.role.code as RoleCode,
    permissions: user.role.rolePermissions.map((entry) => entry.permission.code) as PermissionCode[],
    sessionVersion: user.sessionVersion,
  };
});

/** Redirige vers /login si aucune session valide. À utiliser en haut des pages protégées. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/** Redirige vers /login (ou une page 403 dédiée si besoin) si le rôle ne correspond pas. */
export async function requireRole(...roles: RoleCode[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!roles.includes(session.roleCode)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

/**
 * Vérification serveur d'une permission — à appeler dans CHAQUE Server
 * Action / Route Handler sensible (cahier des charges §60 : ne jamais faire
 * confiance uniquement au frontend).
 */
export async function requirePermission(permission: PermissionCode): Promise<SessionPayload> {
  const session = await requireUser();
  if (!session.permissions.includes(permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

/** Comme requirePermission, pour une page ouverte à plusieurs métiers. */
export async function requireAnyPermission(...permissions: PermissionCode[]): Promise<SessionPayload> {
  const session = await requireUser();
  if (!permissions.some((permission) => session.permissions.includes(permission))) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export function hasPermission(session: SessionPayload | null, permission: PermissionCode): boolean {
  return !!session?.permissions.includes(permission);
}

/**
 * Variantes pour les Route Handlers (API REST, §61) : lèvent une `ApiError`
 * (401/403) au lieu de rediriger — `redirect()` n'a pas de sens pour un
 * appel `fetch()` consommant du JSON.
 */
export async function requireApiUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new ApiError("Authentification requise.", 401);
  return session;
}

export async function requireApiPermission(permission: PermissionCode): Promise<SessionPayload> {
  const session = await requireApiUser();
  if (!session.permissions.includes(permission)) {
    throw new ApiError("Permission refusée.", 403);
  }
  return session;
}
