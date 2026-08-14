import "dotenv/config";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

/**
 * Mint un JWT de session valide pour un utilisateur du seed (Phase 2), signé
 * avec le même AUTH_SECRET que l'application — même principe que le script
 * jetable `scripts/_mint-test-token.mjs` utilisé pour la vérification
 * manuelle des Phases 7 à 12, mais réutilisable par les tests API/E2E
 * (Playwright) : on ne fait jamais transiter de mot de passe en clair dans
 * les tests, seul le token de session est nécessaire pour parler à l'API.
 */

const COOKIE_NAME = "mulcv_session";
const prisma = new PrismaClient();

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET manquant — vérifier le fichier .env avant de lancer les tests Playwright.");
  }
  return new TextEncoder().encode(secret);
}

export interface TestSessionUser {
  userId: number;
  email: string;
  name: string;
  roleCode: string;
  permissions: string[];
}

const cache = new Map<string, TestSessionUser>();

export async function loadTestUser(email: string): Promise<TestSessionUser> {
  const cached = cache.get(email);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
  });
  if (!user) {
    throw new Error(`Utilisateur de test introuvable : ${email} (le seed a-t-il été exécuté ? npm run db:seed)`);
  }

  const result: TestSessionUser = {
    userId: user.id,
    email: user.email,
    name: user.name,
    roleCode: user.role.code,
    permissions: user.role.rolePermissions.map((rp) => rp.permission.code),
  };
  cache.set(email, result);
  return result;
}

export async function mintSessionToken(email: string): Promise<string> {
  const user = await loadTestUser(email);
  return new SignJWT({
    userId: user.userId,
    email: user.email,
    name: user.name,
    roleCode: user.roleCode,
    permissions: user.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(getSecretKey());
}

export async function sessionCookieHeader(email: string): Promise<string> {
  const token = await mintSessionToken(email);
  return `${COOKIE_NAME}=${token}`;
}

/** Comptes de démo créés par prisma/seed.ts (Phase 2) — mot de passe Demo@2026! pour tous. */
export const DEMO_USERS = {
  admin: "admin@mulcv-demo.local",
  superviseur: "superviseur@mulcv-demo.local",
  consultation: "consultation@mulcv-demo.local",
  operateur1: "operateur1@mulcv-demo.local",
} as const;

export { COOKIE_NAME, prisma as testPrisma };
