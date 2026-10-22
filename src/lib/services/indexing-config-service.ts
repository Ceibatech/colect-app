"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";

export interface IndexingFieldActionResult {
  success?: boolean;
  error?: string;
}

const schema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z][a-z0-9_]*$/, "La clé utilise uniquement des lettres minuscules, chiffres et underscores."),
  label: z.string().trim().min(2).max(120),
  aliases: z.string().max(1000),
  dataType: z.enum(["TEXT", "DATE", "NUMBER", "IDENTIFIER"]),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  isRequired: z.boolean(),
  isSearchable: z.boolean(),
  isActive: z.boolean(),
});

function parseForm(formData: FormData) {
  return schema.safeParse({
    key: formData.get("key"),
    label: formData.get("label"),
    aliases: formData.get("aliases") ?? "",
    dataType: formData.get("dataType"),
    sortOrder: formData.get("sortOrder") ?? 0,
    isRequired: formData.get("isRequired") === "on",
    isSearchable: formData.get("isSearchable") === "on",
    isActive: formData.get("isActive") === "on",
  });
}

function aliasesFrom(value: string): string[] {
  return Array.from(new Set(value.split(/[,;\n]/).map((alias) => alias.trim()).filter(Boolean))).slice(0, 30);
}

export async function listIndexingFieldsForAdmin() {
  await requirePermission("SETTINGS_MANAGE");
  return prisma.indexingField.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { _count: { select: { values: true } } },
  });
}

export async function createIndexingField(
  _previous: IndexingFieldActionResult,
  formData: FormData,
): Promise<IndexingFieldActionResult> {
  const session = await requirePermission("SETTINGS_MANAGE");
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champ invalide." };
  const existing = await prisma.indexingField.findUnique({ where: { key: parsed.data.key } });
  if (existing) return { error: `La clé « ${parsed.data.key} » existe déjà.` };

  const field = await prisma.indexingField.create({
    data: { ...parsed.data, aliases: aliasesFrom(parsed.data.aliases) },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "INDEXING_FIELD_CREATE",
      entity: "INDEXING_FIELD",
      entityId: field.id,
      newValue: { key: field.key, label: field.label },
      ipAddress: await getClientIp(),
    },
  });
  return { success: true };
}

export async function updateIndexingField(
  id: number,
  _previous: IndexingFieldActionResult,
  formData: FormData,
): Promise<IndexingFieldActionResult> {
  const session = await requirePermission("SETTINGS_MANAGE");
  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Champ invalide." };
  const before = await prisma.indexingField.findUnique({ where: { id } });
  if (!before) return { error: "Champ d'indexation introuvable." };
  const duplicate = await prisma.indexingField.findUnique({ where: { key: parsed.data.key } });
  if (duplicate && duplicate.id !== id) return { error: `La clé « ${parsed.data.key} » existe déjà.` };

  const field = await prisma.indexingField.update({
    where: { id },
    data: { ...parsed.data, aliases: aliasesFrom(parsed.data.aliases) },
  });
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "INDEXING_FIELD_UPDATE",
      entity: "INDEXING_FIELD",
      entityId: field.id,
      oldValue: { key: before.key, label: before.label, isActive: before.isActive },
      newValue: { key: field.key, label: field.label, isActive: field.isActive },
      ipAddress: await getClientIp(),
    },
  });
  return { success: true };
}
