import { PrismaClient } from "@prisma/client";

// Singleton Prisma Client — évite l'épuisement des connexions MySQL en
// développement (Next.js recharge les modules à chaque changement de fichier).
// Voir https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
