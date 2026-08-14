import "server-only";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { Prisma } from "@prisma/client";

export interface AuditSearchFilters {
  userId?: number;
  action?: string;
  entity?: string;
  entityId?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface AuditSearchOptions {
  page: number;
  pageSize: number;
}

export const AUDIT_PAGE_SIZE = 30;

export async function searchAuditLogs(filters: AuditSearchFilters, options: AuditSearchOptions) {
  await requirePermission("AUDIT_VIEW");

  const where: Prisma.AuditLogWhereInput = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.entity) where.entity = filters.entity;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const page = Math.max(1, options.page);
  const pageSize = options.pageSize;
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export type AuditLogRow = Awaited<ReturnType<typeof searchAuditLogs>>["items"][number];

/** Valeurs distinctes déjà journalisées — alimentent les filtres (pas de liste figée à maintenir à la main). */
export async function getAuditFacets() {
  await requirePermission("AUDIT_VIEW");
  const [actions, entities, users] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    actions: actions.map((a) => a.action),
    entities: entities.map((e) => e.entity),
    users,
  };
}
