export const FINANCE_ACTIVITY_TYPES = ["COLLECTE", "NUMERISATION", "INDEXATION", "ARCHIVAGE"] as const;

export type FinanceActivityType = (typeof FINANCE_ACTIVITY_TYPES)[number];
export type FinanceWorkflowType = "COLLECTE" | "VALIDATION" | "NUMERISATION" | "INDEXATION" | "ARCHIVAGE";
export type SupervisorDecisionKind = "VALIDATION" | "REJET";

export interface WorkflowPointEvent {
  workflowType: FinanceWorkflowType;
  toStatus: string;
}

export function getAcceptedOperatorActivity(event: WorkflowPointEvent): FinanceActivityType | null {
  if (event.workflowType === "VALIDATION" && event.toStatus === "VALIDE") return "COLLECTE";
  if (event.workflowType === "NUMERISATION" && event.toStatus === "TERMINE") return "NUMERISATION";
  if (event.workflowType === "INDEXATION" && event.toStatus === "TERMINE") return "INDEXATION";
  if (event.workflowType === "ARCHIVAGE" && event.toStatus === "TERMINE") return "ARCHIVAGE";
  return null;
}

export function getSupervisorDecisionKind(event: WorkflowPointEvent): SupervisorDecisionKind | null {
  if (event.toStatus === "REJETE") return "REJET";
  return getAcceptedOperatorActivity(event) ? "VALIDATION" : null;
}

export function computeProjectedAmount(points: number, pointValue: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(pointValue) || points <= 0 || pointValue <= 0) return 0;
  return Math.round((points * pointValue + Number.EPSILON) * 100) / 100;
}
