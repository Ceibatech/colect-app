import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken, type SessionPayload } from "@/lib/auth/session";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";
import { ApiError } from "@/lib/utils/api-error";

/**
 * Lit et vérifie la session depuis le cookie httpOnly. `cache()` évite de
 * revérifier le JWT plusieurs fois pour un même rendu de page (plusieurs
 * Server Components peuvent appeler getSession()).
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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
