import { PrismaClient } from "@prisma/client";

// Singleton Prisma Client — évite l'épuisement des connexions MySQL en
// développement (Next.js recharge les modules à chaque changement de fichier).
// Voir https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Borne la taille du pool de connexions MySQL (Phase 19+, suite à l'incident
 * du 21/08/2026 : Render ne parvenait plus à joindre la base cPanel).
 *
 * La base est hébergée sur un cPanel mutualisé (GoDaddy), dont le
 * `max_user_connections` est bas (typiquement 10-25) et dont le pare-feu
 * bloque automatiquement une IP qui ouvre trop de connexions. Par défaut
 * Prisma dimensionne le pool à `nombre_de_CPU * 2 + 1`, ce qui peut dépasser
 * ce que l'hébergeur tolère. On le fixe donc explicitement, plutôt que de
 * dépendre du nombre de CPU vu par le conteneur Render.
 *
 * Concaténation de chaîne volontaire (pas `new URL()`) : le mot de passe de
 * production contient des caractères déjà percent-encodés, qu'une
 * re-sérialisation par `URL` pourrait ré-encoder différemment et casser
 * l'authentification.
 */
function databaseUrlWithPoolLimit(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (raw.includes("connection_limit=")) return raw; // déjà fixé côté variable d'env
  return `${raw}${raw.includes("?") ? "&" : "?"}connection_limit=5&pool_timeout=20`;
}

const databaseUrl = databaseUrlWithPoolLimit();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
