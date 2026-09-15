import { describe, expect, it } from "vitest";
import { computePipelineScore, computeQualityScore } from "@/lib/utils/pipeline-score";

describe("computePipelineScore", () => {
  it("returns zero without an active portfolio", () => {
    expect(
      computePipelineScore({ total: 0, submitted: 0, validated: 0, digitized: 0, indexed: 0, archived: 0 }),
    ).toBe(0);
  });

  it("scores every completed milestone equally", () => {
    expect(
      computePipelineScore({ total: 6, submitted: 4, validated: 2, digitized: 1, indexed: 0, archived: 0 }),
    ).toBe(23);
  });

  it("returns one hundred for a fully completed portfolio", () => {
    expect(
      computePipelineScore({ total: 8, submitted: 8, validated: 8, digitized: 8, indexed: 8, archived: 8 }),
    ).toBe(100);
  });

  it("bounds inconsistent counts to the portfolio size", () => {
    expect(
      computePipelineScore({ total: 2, submitted: 4, validated: 2, digitized: 2, indexed: 2, archived: 2 }),
    ).toBe(100);
  });
});

describe("computeQualityScore", () => {
  it("measures the share of dossiers without an active risk", () => {
    expect(computeQualityScore(3, 1)).toBe(67);
    expect(computeQualityScore(3, 0)).toBe(100);
  });

  it("bounds risk counts and handles an empty portfolio", () => {
    expect(computeQualityScore(3, 10)).toBe(0);
    expect(computeQualityScore(0, 0)).toBe(0);
  });
});
