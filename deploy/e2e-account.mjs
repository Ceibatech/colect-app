// Compte administrateur temporaire pour un test de bout en bout en production.
//
//   node deploy/e2e-account.mjs --create --hash='$2b$10$…'   → crée ou réactive le compte
//   node deploy/e2e-account.mjs --delete                     → supprime le compte (ou le désactive s'il a laissé des traces)
//
// Seul le hachage bcrypt du mot de passe transite (jamais le mot de passe).
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

export const E2E_EMAIL = "test-e2e@geoarchives.local";
const E2E_NAME = "Test automatique (à supprimer)";
const BCRYPT = /^\$2[aby]\$1[0-2]\$[./A-Za-z0-9]{53}$/;

export async function createAccount(db, hash) {
  if (!BCRYPT.test(hash)) throw new Error("Hachage bcrypt invalide.");
  const role = await db.role.findUnique({ where: { code: "ADMIN" }, select: { id: true } });
  if (!role) throw new Error("Rôle ADMIN introuvable.");
  const user = await db.user.upsert({
    where: { email: E2E_EMAIL },
    update: { passwordHash: hash, isActive: true, roleId: role.id, sessionVersion: { increment: 1 } },
    create: { email: E2E_EMAIL, name: E2E_NAME, passwordHash: hash, roleId: role.id },
    select: { id: true },
  });
  await db.auditLog.create({ data: { action: "E2E_ACCOUNT_CREATE", entity: "USER", entityId: user.id } });
  return user.id;
}

export async function deleteAccount(db) {
  const user = await db.user.findUnique({ where: { email: E2E_EMAIL }, select: { id: true } });
  if (!user) return "absent";
  try {
    await db.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.transferEmailDelivery.deleteMany({ where: { recipientUserId: user.id } });
      await tx.emailReportDelivery.deleteMany({ where: { recipientUserId: user.id } });
      await tx.auditLog.create({ data: { action: "E2E_ACCOUNT_DELETE", entity: "USER", entityId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });
    return "supprimé";
  } catch {
    // Traces métier restantes : le compte est neutralisé.
    await db.user.update({ where: { id: user.id }, data: { isActive: false, passwordHash: "!", sessionVersion: { increment: 1 } } });
    return "désactivé (traces conservées)";
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    if (args.includes("--create")) {
      const hash = args.find((arg) => arg.startsWith("--hash="))?.slice("--hash=".length) ?? "";
      console.log(`Compte de test ${E2E_EMAIL} prêt (id ${await createAccount(prisma, hash)}).`);
    } else if (args.includes("--delete")) {
      console.log(`Compte de test ${E2E_EMAIL} : ${await deleteAccount(prisma)}.`);
    } else {
      throw new Error("--create ou --delete attendu.");
    }
  } catch (error) {
    console.error(`Compte de test : échec — ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
