"use server";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { hashPassword } from "@/lib/auth/password";
import { createUserSchema, updateUserSchema, resetPasswordSchema } from "@/lib/validation/user-admin";

/**
 * CRUD administration des utilisateurs (Phase 15+, §11) — jamais de
 * suppression physique : un utilisateur est référencé par de nombreux
 * historiques (dossier_history, audit_logs, workflow_transitions...),
 * une suppression casserait l'intégrité de ces journaux. Seule la
 * désactivation (`isActive`) empêche la connexion sans perdre l'historique.
 *
 * Lien Opérateur : un utilisateur de rôle OPERATEUR a besoin d'une fiche
 * `operateurs` (1:1, `userId`) pour apparaître dans les listes d'opérateurs
 * actifs et pouvoir créer/soumettre des dossiers (cf. dossier-service.ts,
 * workflow-service.ts::resolveOperateurId). Ce lien est créé/désactivé
 * automatiquement ici selon le rôle choisi — jamais à la charge de
 * l'administrateur de le faire manuellement ailleurs.
 */

export interface ActionResult {
  error?: string;
  success?: boolean;
}

export async function listUsersWithRoles() {
  await requirePermission("USER_MANAGE");
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    include: {
      role: true,
      operateur: { select: { id: true, matricule: true, isActive: true } },
      _count: { select: { supervisedOperateurs: true } },
    },
  });
}

export async function listRoles() {
  await requirePermission("USER_MANAGE");
  return prisma.role.findMany({ orderBy: { name: "asc" } });
}

/**
 * Opérateurs actifs disponibles pour l'affectation à un superviseur
 * (Phase 16+), avec leur affectation actuelle le cas échéant — un
 * administrateur peut ainsi voir qu'il "vole" un opérateur déjà affecté à
 * un autre superviseur avant de confirmer.
 */
export async function listActiveOperateursForAssignment() {
  await requirePermission("USER_MANAGE");
  return prisma.operateur.findMany({
    where: { isActive: true },
    orderBy: { nom: "asc" },
    select: {
      id: true,
      matricule: true,
      nom: true,
      prenoms: true,
      supervisorId: true,
      supervisor: { select: { id: true, name: true } },
    },
  });
}

async function nextOperateurMatricule(): Promise<string> {
  const count = await prisma.operateur.count();
  let n = count + 1;
  // Boucle de sécurité si une matricule a été supprimée/réutilisée entre-temps (unique constraint).
  for (let attempts = 0; attempts < 1000; attempts++) {
    const candidate = `OP-${String(n).padStart(3, "0")}`;
    const exists = await prisma.operateur.findUnique({ where: { matricule: candidate } });
    if (!exists) return candidate;
    n++;
  }
  throw new Error("Impossible de générer une matricule opérateur unique.");
}

export async function createUser(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("USER_MANAGE");
  const parsed = createUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    roleId: formData.get("roleId"),
    telephone: formData.get("telephone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: `L'e-mail "${email}" est déjà utilisé.` };

  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) return { error: "Rôle introuvable." };

  const passwordHash = await hashPassword(parsed.data.password);
  const ip = await getClientIp();

  const user = await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash, roleId: role.id },
  });

  if (role.code === "OPERATEUR") {
    const matricule = await nextOperateurMatricule();
    await prisma.operateur.create({
      data: {
        userId: user.id,
        matricule,
        nom: parsed.data.name,
        telephone: parsed.data.telephone || null,
        email,
        isActive: true,
      },
    });
  }

  await prisma.auditLog.create({
    data: { userId: session.userId, action: "USER_CREATE", entity: "USER", entityId: user.id, newValue: { name: user.name, email, role: role.code }, ipAddress: ip },
  });

  return { success: true };
}

export async function updateUser(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("USER_MANAGE");
  const parsed = updateUserSchema.safeParse({
    name: formData.get("name"),
    roleId: formData.get("roleId"),
    isActive: formData.get("isActive") === "on",
    operateurIds: formData.getAll("operateurIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const before = await prisma.user.findUnique({ where: { id }, include: { role: true, operateur: true } });
  if (!before) return { error: "Utilisateur introuvable." };

  const newRole = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!newRole) return { error: "Rôle introuvable." };

  if (before.id === session.userId && !parsed.data.isActive) {
    return { error: "Vous ne pouvez pas désactiver votre propre compte." };
  }

  // Phase 16+ : un opérateur déjà affecté à un AUTRE superviseur ne peut
  // plus être affecté ici — il faut d'abord retirer son affectation
  // actuelle (depuis la fiche de ce superviseur) avant de pouvoir le
  // réaffecter. Contrôlé aussi côté client (case décochée/désactivée dans
  // OperateurAssignmentField) mais revérifié ici, jamais de confiance dans
  // le formulaire (§60).
  if (newRole.code === "SUPERVISEUR" && parsed.data.operateurIds.length > 0) {
    const conflicting = await prisma.operateur.findMany({
      where: { id: { in: parsed.data.operateurIds }, supervisorId: { not: null, notIn: [id] } },
      select: { nom: true, prenoms: true },
    });
    if (conflicting.length > 0) {
      const names = conflicting.map((o) => `${o.nom} ${o.prenoms ?? ""}`.trim()).join(", ");
      return {
        error: `Déjà affecté(s) à un autre superviseur : ${names}. Retirez d'abord leur affectation actuelle avant de les réaffecter ici.`,
      };
    }
  }

  const ip = await getClientIp();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: { name: parsed.data.name, roleId: newRole.id, isActive: parsed.data.isActive },
    });

    if (newRole.code === "OPERATEUR" && !before.operateur) {
      const matricule = await nextOperateurMatricule();
      await tx.operateur.create({
        data: { userId: id, matricule, nom: parsed.data.name, email: before.email, isActive: true },
      });
    } else if (newRole.code === "OPERATEUR" && before.operateur) {
      await tx.operateur.update({ where: { id: before.operateur.id }, data: { nom: parsed.data.name, isActive: parsed.data.isActive } });
    } else if (newRole.code !== "OPERATEUR" && before.operateur?.isActive) {
      // Rôle changé hors OPERATEUR : désactive la fiche opérateur (jamais de
      // suppression — les dossiers déjà traités par cette fiche restent valides).
      await tx.operateur.update({ where: { id: before.operateur.id }, data: { isActive: false } });
    }

    // Phase 16+ (affectation opérateur -> superviseur, §workflow validation) :
    // synchronise Operateur.supervisorId sur la liste choisie dans le
    // formulaire. `notIn: desired` avec `desired` vide équivaut à "pas de
    // filtre" côté Prisma (undefined ignoré) -> libère tout le monde.
    if (newRole.code === "SUPERVISEUR") {
      const desired = parsed.data.operateurIds;
      await tx.operateur.updateMany({
        where: { supervisorId: id, ...(desired.length ? { id: { notIn: desired } } : {}) },
        data: { supervisorId: null },
      });
      if (desired.length > 0) {
        // `OR supervisorId null/mine` : re-garde-fou contre une réaffectation
        // concurrente survenue entre la vérification ci-dessus et cette
        // écriture (§60) — un opérateur affecté entre-temps à un autre
        // superviseur reste inchangé plutôt que d'être silencieusement volé.
        await tx.operateur.updateMany({
          where: { id: { in: desired }, OR: [{ supervisorId: null }, { supervisorId: id }] },
          data: { supervisorId: id },
        });
      }
    } else if (before.role.code === "SUPERVISEUR") {
      // Rôle changé hors SUPERVISEUR : libère les opérateurs qu'il supervisait
      // (sinon une affectation resterait en base sans effet visible mais
      // incohérente si ce compte redevient superviseur plus tard).
      await tx.operateur.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: "USER_UPDATE",
        entity: "USER",
        entityId: id,
        oldValue: { name: before.name, role: before.role.code, isActive: before.isActive },
        newValue: { name: parsed.data.name, role: newRole.code, isActive: parsed.data.isActive },
        ipAddress: ip,
      },
    });
  });

  return { success: true };
}

export async function resetUserPassword(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("USER_MANAGE");
  const parsed = resetPasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Utilisateur introuvable." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const ip = await getClientIp();

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: { userId: session.userId, action: "PASSWORD_RESET_ADMIN", entity: "USER", entityId: id, ipAddress: ip },
    }),
  ]);

  return { success: true };
}
