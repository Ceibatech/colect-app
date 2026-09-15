import "server-only";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getOperateurPerformance, type OperateurPerformanceRow } from "@/lib/services/dashboard-service";
import { computePipelineScore, computeQualityScore } from "@/lib/utils/pipeline-score";

export interface PmoSupervisorRow {
  id: number;
  name: string;
  operatorCount: number;
  total: number;
  submitted: number;
  validated: number;
  digitized: number;
  indexed: number;
  archived: number;
  atRisk: number;
  progress: number;
  quality: number;
}

export interface PmoOverview {
  supervisors: PmoSupervisorRow[];
  summary: {
    supervisorCount: number;
    operatorCount: number;
    total: number;
    archived: number;
    atRisk: number;
    progress: number;
    quality: number;
  };
}

function sumPerformance(rows: OperateurPerformanceRow[]) {
  return rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      submitted: acc.submitted + row.soumis,
      validated: acc.validated + row.valides,
      digitized: acc.digitized + row.numerises,
      indexed: acc.indexed + row.indexes,
      archived: acc.archived + row.archives,
      atRisk: acc.atRisk + row.dossiersARisque,
    }),
    { total: 0, submitted: 0, validated: 0, digitized: 0, indexed: 0, archived: 0, atRisk: 0 },
  );
}

export async function getPmoOverview(): Promise<PmoOverview> {
  const session = await requirePermission("PMO_VIEW");
  const [performance, supervisors] = await Promise.all([
    getOperateurPerformance(),
    prisma.user.findMany({
      where: {
        role: { code: "SUPERVISEUR" },
        isActive: true,
        ...(session.roleCode === "PMO" ? { pmoScopeMemberships: { some: { pmoUserId: session.userId } } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        supervisedOperateurs: { where: { isActive: true }, select: { id: true } },
      },
    }),
  ]);
  const performanceById = new Map(performance.map((row) => [row.id, row]));

  const rows = supervisors.map((supervisor) => {
    const operatorRows = supervisor.supervisedOperateurs
      .map((operator) => performanceById.get(operator.id))
      .filter((row): row is OperateurPerformanceRow => Boolean(row));
    const totals = sumPerformance(operatorRows);
    return {
      id: supervisor.id,
      name: supervisor.name,
      operatorCount: supervisor.supervisedOperateurs.length,
      ...totals,
      progress: computePipelineScore(totals),
      quality: computeQualityScore(totals.total, totals.atRisk),
    };
  }).sort((a, b) => b.atRisk - a.atRisk || a.progress - b.progress || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      submitted: acc.submitted + row.submitted,
      validated: acc.validated + row.validated,
      digitized: acc.digitized + row.digitized,
      indexed: acc.indexed + row.indexed,
      archived: acc.archived + row.archived,
      atRisk: acc.atRisk + row.atRisk,
      operatorCount: acc.operatorCount + row.operatorCount,
    }),
    { total: 0, submitted: 0, validated: 0, digitized: 0, indexed: 0, archived: 0, atRisk: 0, operatorCount: 0 },
  );

  return {
    supervisors: rows,
    summary: {
      supervisorCount: rows.length,
      operatorCount: totals.operatorCount,
      total: totals.total,
      archived: totals.archived,
      atRisk: totals.atRisk,
      progress: computePipelineScore(totals),
      quality: computeQualityScore(totals.total, totals.atRisk),
    },
  };
}