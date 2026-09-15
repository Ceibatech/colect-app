import { describe, expect, it } from "vitest";
import { financeRateSchema } from "@/lib/validation/finance";

describe("financeRateSchema", () => {
  it("accepts a dated non-negative rate and normalizes the currency", () => {
    const result = financeRateSchema.safeParse({
      operatorPointValue: "1250.50",
      supervisorPointValue: "800",
      currency: "xof",
      effectiveFrom: "2026-09-15",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.currency).toBe("XOF");
  });

  it("rejects negative values and malformed dates", () => {
    expect(financeRateSchema.safeParse({ operatorPointValue: -1, supervisorPointValue: 2, currency: "XOF", effectiveFrom: "2026-09-15" }).success).toBe(false);
    expect(financeRateSchema.safeParse({ operatorPointValue: 1, supervisorPointValue: 2, currency: "XOF", effectiveFrom: "15/09/2026" }).success).toBe(false);
  });
});