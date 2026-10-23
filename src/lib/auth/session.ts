import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { PERMISSIONS, ROLE_CODES, type PermissionCode, type RoleCode } from "@/lib/permissions/constants";

const COOKIE_NAME = "mulcv_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 heures
const SESSION_ISSUER = "geoarchives";
const SESSION_AUDIENCE = "geoarchives-web";

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "changeme-generate-a-random-secret-with-openssl-rand-base64-32") {
    throw new Error(
      "AUTH_SECRET n'est pas configuré (ou utilise la valeur par défaut du .env.example). " +
        "Générer une vraie valeur avec `openssl rand -base64 32` avant de démarrer l'application."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  userId: number;
  email: string;
  name: string;
  roleCode: RoleCode;
  permissions: PermissionCode[];
  sessionVersion: number;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    if (
      typeof payload.userId !== "number" ||
      payload.sub !== String(payload.userId) ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.roleCode !== "string" ||
      !ROLE_CODES.includes(payload.roleCode as RoleCode) ||
      !Array.isArray(payload.permissions) ||
      !payload.permissions.every((permission) =>
        typeof permission === "string" && PERMISSIONS.includes(permission as PermissionCode)
      ) ||
      !Number.isInteger(payload.sessionVersion) ||
      (payload.sessionVersion as number) < 1
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, SESSION_DURATION_SECONDS, SESSION_AUDIENCE, SESSION_ISSUER };
