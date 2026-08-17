"use server";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { communeSchema, lotissementSchema, natureDossierSchema } from "@/lib/validation/referentiels";

/**
 * CRUD administration des référentiels géographiques (Phase 15+) — jamais de
 * suppression physique (`delete`) : les communes/lotissements/natures sont
 * référencés par des dossiers réels une fois utilisés, une suppression
 * casserait l'intégrité historique. Seule la désactivation (`isActive`)
 * retire une entrée des listes proposées à la Collecte (§40) sans perdre
 * l'historique des dossiers déjà rattachés.
 */

export interface ActionResult {
  error?: string;
  success?: boolean;
}

// ---------------------------------------------------------------- Communes

export async function listAllCommunes() {
  await requirePermission("REFERENTIEL_MANAGE");
  return prisma.commune.findMany({ orderBy: { nom: "asc" }, include: { _count: { select: { lotissements: true, dossiers: true } } } });
}

export async function createCommune(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = communeSchema.safeParse({
    code: formData.get("code"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.commune.findUnique({ where: { code: parsed.data.code } });
  if (existing) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const commune = await prisma.commune.create({
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: { userId: session.userId, action: "COMMUNE_CREATE", entity: "COMMUNE", entityId: commune.id, newValue: parsed.data, ipAddress: await getClientIp() },
  });
  return { success: true };
}

export async function updateCommune(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = communeSchema.safeParse({
    code: formData.get("code"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.commune.findUnique({ where: { code: parsed.data.code } });
  if (existing && existing.id !== id) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const before = await prisma.commune.findUnique({ where: { id } });
  const commune = await prisma.commune.update({
    where: { id },
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "COMMUNE_UPDATE",
      entity: "COMMUNE",
      entityId: commune.id,
      oldValue: before ? { code: before.code, nom: before.nom, isActive: before.isActive } : undefined,
      newValue: parsed.data,
      ipAddress: await getClientIp(),
    },
  });
  return { success: true };
}

// ------------------------------------------------------------ Lotissements

export async function listAllLotissements() {
  await requirePermission("REFERENTIEL_MANAGE");
  return prisma.lotissement.findMany({
    orderBy: [{ commune: { nom: "asc" } }, { nom: "asc" }],
    include: { commune: { select: { id: true, nom: true } }, _count: { select: { dossiers: true } } },
  });
}

export async function createLotissement(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = lotissementSchema.safeParse({
    communeId: formData.get("communeId"),
    code: formData.get("code"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.lotissement.findUnique({ where: { code: parsed.data.code } });
  if (existing) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const lotissement = await prisma.lotissement.create({
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: { userId: session.userId, action: "LOTISSEMENT_CREATE", entity: "LOTISSEMENT", entityId: lotissement.id, newValue: parsed.data, ipAddress: await getClientIp() },
  });
  return { success: true };
}

export async function updateLotissement(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = lotissementSchema.safeParse({
    communeId: formData.get("communeId"),
    code: formData.get("code"),
    nom: formData.get("nom"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.lotissement.findUnique({ where: { code: parsed.data.code } });
  if (existing && existing.id !== id) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const before = await prisma.lotissement.findUnique({ where: { id } });
  const lotissement = await prisma.lotissement.update({
    where: { id },
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "LOTISSEMENT_UPDATE",
      entity: "LOTISSEMENT",
      entityId: lotissement.id,
      oldValue: before ? { code: before.code, nom: before.nom, isActive: before.isActive } : undefined,
      newValue: parsed.data,
      ipAddress: await getClientIp(),
    },
  });
  return { success: true };
}

// ----------------------------------------------------------- Natures dossier

export async function listAllNatures() {
  await requirePermission("REFERENTIEL_MANAGE");
  return prisma.natureDossier.findMany({ orderBy: { libelle: "asc" }, include: { _count: { select: { dossiers: true } } } });
}

export async function createNature(_prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = natureDossierSchema.safeParse({
    code: formData.get("code"),
    libelle: formData.get("libelle"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.natureDossier.findUnique({ where: { code: parsed.data.code } });
  if (existing) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const nature = await prisma.natureDossier.create({
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: { userId: session.userId, action: "NATURE_CREATE", entity: "NATURE_DOSSIER", entityId: nature.id, newValue: parsed.data, ipAddress: await getClientIp() },
  });
  return { success: true };
}

export async function updateNature(id: number, _prevState: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("REFERENTIEL_MANAGE");
  const parsed = natureDossierSchema.safeParse({
    code: formData.get("code"),
    libelle: formData.get("libelle"),
    description: formData.get("description"),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const existing = await prisma.natureDossier.findUnique({ where: { code: parsed.data.code } });
  if (existing && existing.id !== id) return { error: `Le code "${parsed.data.code}" est déjà utilisé.` };

  const before = await prisma.natureDossier.findUnique({ where: { id } });
  const nature = await prisma.natureDossier.update({
    where: { id },
    data: { ...parsed.data, description: parsed.data.description || null },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "NATURE_UPDATE",
      entity: "NATURE_DOSSIER",
      entityId: nature.id,
      oldValue: before ? { code: before.code, libelle: before.libelle, isActive: before.isActive } : undefined,
      newValue: parsed.data,
      ipAddress: await getClientIp(),
    },
  });
  return { success: true };
}
