import "server-only";

import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import {
  FINANCE_ACTIVITY_TYPES,
  computeProjectedAmount,
  getAcceptedOperatorActivity,
  getSupervisorDecisionKind,
  type FinanceActivityType,
} from "@/lib/utils/finance-points";

export interface FinancePeriod {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export interface FinanceRateView {
  id: number;
  operatorPointValue: number;
  supervisorPointValue: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface FinanceOperatorRow {
  id: number;
  name: string;
  matricule: string;
  isActive: boolean;
  supervisorName: string | null;
  activities: Record<FinanceActivityType, number>;
  points: number;
  projectedAmount: number;
  uncoveredPoints: number;
}

export interface FinanceSupervisorRow {
  id: number;
  name: string;
  isActive: boolean;
  validations: number;
  rejections: number;
  points: number;
  projectedAmount: number;
  uncoveredPoints: number;
}

export interface FinanceDashboardData {
  period: FinancePeriod;
  rates: FinanceRateView[];
  activeRate: FinanceRateView | null;
  nextRateDate: string;
  operatorRows: FinanceOperatorRow[];
  supervisorRows: FinanceSupervisorRow[];
  summary: {
    operatorPoints: number;
    supervisorPoints: number;
    totalPoints: number;
    operatorAmount: number;
    supervisorAmount: number;
    projectedAmount: number;
    uncoveredPoints: number;
    currency: string;
  };
}

export function getFinancePeriod(month?: string): FinancePeriod {
  const today = new Date();
  const fallback = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : fallback;
  const [year, monthNumber] = key.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1), start, end };
}

function emptyActivities(): Record<FinanceActivityType, number> {
  return { COLLECTE: 0, NUMERISATION: 0, INDEXATION: 0, ARCHIVAGE: 0 };
}

export async function getFinanceDashboardData(month?: string): Promise<FinanceDashboardData> {
  await requirePermission("FINANCE_VIEW");
  const period = getFinancePeriod(month);

  const [operators, supervisors, transitions, rawRates, latestRate] = await Promise.all([
    prisma.operateur.findMany({
      orderBy: [{ nom: "asc" }, { prenoms: "asc" }],
      select: {
        id: true,
        matricule: true,
        nom: true,
        prenoms: true,
        isActive: true,
        supervisor: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: { code: "SUPERVISEUR" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.workflowTransition.findMany({
      where: {
        createdAt: { gte: period.start, lt: period.end },
        OR: [
          { workflowType: "VALIDATION", toStatus: { in: ["VALIDE", "REJETE"] } },
          { workflowType: "NUMERISATION", toStatus: { in: ["TERMINE", "REJETE"] } },
          { workflowType: "INDEXATION", toStatus: { in: ["TERMINE", "REJETE"] } },
          { workflowType: "ARCHIVAGE", toStatus: { in: ["TERMINE", "REJETE"] } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        dossierId: true,
        workflowType: true,
        toStatus: true,
        userId: true,
        createdAt: true,
        dossier: { select: { operateurId: true } },
      },
    }),
    prisma.financeRate.findMany({ orderBy: { effectiveFrom: "asc" } }),
    prisma.financeRate.findFirst({ orderBy: { effectiveFrom: "desc" }, select: { effectiveFrom: true } }),
  ]);

  const rates: FinanceRateView[] = rawRates.map((entry) => ({
    id: entry.id,
    operatorPointValue: Number(entry.operatorPointValue),
    supervisorPointValue: Number(entry.supervisorPointValue),
    currency: entry.currency,
    effectiveFrom: entry.effectiveFrom.toISOString(),
    effectiveTo: entry.effectiveTo?.toISOString() ?? null,
  }));
  const rateAt = (date: Date) => rates.find((entry) => {
    const from = new Date(entry.effectiveFrom);
    const to = entry.effectiveTo ? new Date(entry.effectiveTo) : null;
    return from <= date && (!to || date < to);
  }) ?? null;

  const operatorRows = new Map<number, FinanceOperatorRow>(operators.map((operator) => [
    operator.id,
    {
      id: operator.id,
      name: `${operator.nom} ${operator.prenoms ?? ""}`.trim(),
      matricule: operator.matricule,
      isActive: operator.isActive,
      supervisorName: operator.supervisor?.name ?? null,
      activities: emptyActivities(),
      points: 0,
      projectedAmount: 0,
      uncoveredPoints: 0,
    },
  ]));
  const supervisorRows = new Map<number, FinanceSupervisorRow>(supervisors.map((supervisor) => [
    supervisor.id,
    {
      id: supervisor.id,
      name: supervisor.name,
      isActive: supervisor.isActive,
      validations: 0,
      rejections: 0,
      points: 0,
      projectedAmount: 0,
      uncoveredPoints: 0,
    },
  ]));

  const creditedOperatorStages = new Set<string>();
  for (const transition of transitions) {
    const activity = getAcceptedOperatorActivity(transition);
    if (activity) {
      const stageKey = `${transition.dossierId}:${activity}`;
      const row = operatorRows.get(transition.dossier.operateurId);
      if (row && !creditedOperatorStages.has(stageKey)) {
        creditedOperatorStages.add(stageKey);
        row.activities[activity]++;
        row.points++;
        const applicableRate = rateAt(transition.createdAt);
        if (applicableRate) row.projectedAmount += computeProjectedAmount(1, applicableRate.operatorPointValue);
        else row.uncoveredPoints++;
      }
    }

    const decision = getSupervisorDecisionKind(transition);
    if (decision && transition.userId) {
      const row = supervisorRows.get(transition.userId);
      if (row) {
        if (decision === "VALIDATION") row.validations++;
        else row.rejections++;
        row.points++;
        const applicableRate = rateAt(transition.createdAt);
        if (applicableRate) row.projectedAmount += computeProjectedAmount(1, applicableRate.supervisorPointValue);
        else row.uncoveredPoints++;
      }
    }
  }

  const visibleOperators = [...operatorRows.values()]
    .filter((row) => row.isActive || row.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const visibleSupervisors = [...supervisorRows.values()]
    .filter((row) => row.isActive || row.points > 0)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const operatorPoints = visibleOperators.reduce((sum, row) => sum + row.points, 0);
  const supervisorPoints = visibleSupervisors.reduce((sum, row) => sum + row.points, 0);
  const operatorAmount = visibleOperators.reduce((sum, row) => sum + row.projectedAmount, 0);
  const supervisorAmount = visibleSupervisors.reduce((sum, row) => sum + row.projectedAmount, 0);
  const uncoveredPoints = [...visibleOperators, ...visibleSupervisors].reduce((sum, row) => sum + row.uncoveredPoints, 0);
  const referenceDate = new Date(period.end.getTime() - 1);
  const activeRate = rateAt(referenceDate) ?? rates.at(-1) ?? null;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const firstAvailableDate = latestRate
    ? new Date(latestRate.effectiveFrom.getTime() + 24 * 60 * 60 * 1000)
    : todayUtc;
  const nextRateDate = (firstAvailableDate > todayUtc ? firstAvailableDate : todayUtc).toISOString().slice(0, 10);

  return {
    period,
    rates,
    activeRate,
    nextRateDate,
    operatorRows: visibleOperators,
    supervisorRows: visibleSupervisors,
    summary: {
      operatorPoints,
      supervisorPoints,
      totalPoints: operatorPoints + supervisorPoints,
      operatorAmount,
      supervisorAmount,
      projectedAmount: operatorAmount + supervisorAmount,
      uncoveredPoints,
      currency: activeRate?.currency ?? rates[0]?.currency ?? "XOF",
    },
  };
}

export function getFinanceActivityLabel(activity: FinanceActivityType): string {
  return {
    COLLECTE: "Collecte validée",
    NUMERISATION: "Numérisation validée",
    INDEXATION: "Indexation validée",
    ARCHIVAGE: "Archivage validé",
  }[activity];
}

export { FINANCE_ACTIVITY_TYPES };