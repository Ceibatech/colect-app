/**
 * Crée (ou met à jour le mot de passe d'­) un utilisateur réel — Phase 15
 * (§95/§96), à utiliser pour le premier compte admin de production puis pour
 * tout autre compte réel (jamais de compte fictif via ce script).
 *
 * Usage (PowerShell) :
 *   $env:DATABASE_URL = "mysql://...";
 *   $env:USER_NAME = "Apeli"; $env:USER_EMAIL = "dac03@ceiba-analytics.com";
 *   $env:USER_PASSWORD = "..."; $env:USER_ROLE = "ADMIN";
 *   npx tsx scripts/create-user.ts
 *
 * `USER_ROLE` doit être un code de rôle déjà en base (ADMIN, SUPERVISEUR,
 * OPERATEUR, CONSULTATION — voir prisma/seed-production-core.ts). Idempotent
 * sur l'e-mail : relancer avec le même e-mail mais un nouveau mot de passe
 * réinitialise le mot de passe de ce compte.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const name = process.env.USER_NAME;
  const email = process.env.USER_EMAIL;
  const password = process.env.USER_PASSWORD;
  const roleCode = process.env.USER_ROLE ?? "ADMIN";

  if (!name || !email || !password) {
    console.error("USER_NAME, USER_EMAIL et USER_PASSWORD sont requis (variables d'environnement).");
    process.exit(1);
  }

  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    console.error(`Rôle "${roleCode}" introuvable — avez-vous lancé prisma/seed-production-core.ts ?`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, roleId: role.id },
    create: { name, email, passwordHash, roleId: role.id },
  });

  console.log(`✔ Utilisateur "${user.name}" <${user.email}> (rôle ${roleCode}) créé/mis à jour — id ${user.id}.`);
}

main()
  .catch((e) => {
    console.error("Erreur :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
