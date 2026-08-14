import { describe, expect, it } from "vitest";
import { computeRate } from "@/lib/utils/rate";

describe("computeRate (KPI dashboard, §46/§47)", () => {
  it("retourne 0 quand le dénominateur est nul", () => {
    expect(computeRate(5, 0)).toBe(0);
  });

  it("retourne 0 quand le dénominateur est négatif (jamais censé arriver, garde défensive)", () => {
    expect(computeRate(5, -3)).toBe(0);
  });

  it("calcule un pourcentage arrondi à 1 décimale", () => {
    expect(computeRate(1, 3)).toBe(33.3);
    expect(computeRate(2, 3)).toBe(66.7);
  });

  it("retourne 100 quand numérateur = dénominateur", () => {
    expect(computeRate(42, 42)).toBe(100);
  });

  it("retourne 0 quand le numérateur est 0", () => {
    expect(computeRate(0, 10)).toBe(0);
  });
});
