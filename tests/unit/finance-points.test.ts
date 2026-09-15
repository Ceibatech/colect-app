import { describe, expect, it } from "vitest";
import {
  computeProjectedAmount,
  getAcceptedOperatorActivity,
  getSupervisorDecisionKind,
} from "@/lib/utils/finance-points";

describe("finance point attribution", () => {
  it("credits operator work only when a stage is finally accepted", () => {
    expect(getAcceptedOperatorActivity({ workflowType: "VALIDATION", toStatus: "VALIDE" })).toBe("COLLECTE");
    expect(getAcceptedOperatorActivity({ workflowType: "NUMERISATION", toStatus: "TERMINE" })).toBe("NUMERISATION");
    expect(getAcceptedOperatorActivity({ workflowType: "INDEXATION", toStatus: "TERMINE" })).toBe("INDEXATION");
    expect(getAcceptedOperatorActivity({ workflowType: "ARCHIVAGE", toStatus: "TERMINE" })).toBe("ARCHIVAGE");
  });

  it("does not credit submissions, pending work, or rejected operator work", () => {
    expect(getAcceptedOperatorActivity({ workflowType: "COLLECTE", toStatus: "SOUMIS" })).toBeNull();
    expect(getAcceptedOperatorActivity({ workflowType: "NUMERISATION", toStatus: "A_VALIDER" })).toBeNull();
    expect(getAcceptedOperatorActivity({ workflowType: "INDEXATION", toStatus: "REJETE" })).toBeNull();
  });

  it("counts both accepted and rejected supervisor decisions", () => {
    expect(getSupervisorDecisionKind({ workflowType: "VALIDATION", toStatus: "VALIDE" })).toBe("VALIDATION");
    expect(getSupervisorDecisionKind({ workflowType: "ARCHIVAGE", toStatus: "TERMINE" })).toBe("VALIDATION");
    expect(getSupervisorDecisionKind({ workflowType: "INDEXATION", toStatus: "REJETE" })).toBe("REJET");
    expect(getSupervisorDecisionKind({ workflowType: "INDEXATION", toStatus: "A_VALIDER" })).toBeNull();
  });

  it("computes a stable two-decimal budget projection", () => {
    expect(computeProjectedAmount(7, 1250.5)).toBe(8753.5);
    expect(computeProjectedAmount(0, 1250.5)).toBe(0);
    expect(computeProjectedAmount(7, -1)).toBe(0);
  });
});
