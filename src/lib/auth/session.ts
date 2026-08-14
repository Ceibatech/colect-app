import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";

const COOKIE_NAME = "mulcv_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 heures

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
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, SESSION_DURATION_SECONDS };
