import { describe, expect, it } from "vitest";
import { durationSeconds, finishError, formatDuration, isTakeoverAllowed } from "@/lib/workflow/reconditionnement";

describe("reconditionnement par dossier", () => {
  it("mesure le temps entre le début et la réponse de fin", () => {
    expect(durationSeconds(new Date("2026-10-26T09:00:00Z"), new Date("2026-10-26T09:12:30Z"))).toBe(750);
    expect(durationSeconds(new Date("2026-10-26T09:00:00Z"), new Date("2026-10-26T08:59:00Z"))).toBe(0);
  });

  it("affiche une durée lisible", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(750)).toBe("12 min 30 s");
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(3900)).toBe("1 h 05 min");
    expect(formatDuration(null)).toBe("—");
  });

  it("exige l'explication d'une réserve", () => {
    expect(finishError("AVEC_RESERVE", "  ")).toMatch(/Décrivez la réserve/);
    expect(finishError("AVEC_RESERVE", "Pièce 3 manquante")).toBeNull();
    expect(finishError("ETAT_INITIAL", undefined)).toBeNull();
  });

  it("laisse un collègue reprendre un dossier oublié depuis 2 h", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(isTakeoverAllowed(new Date("2026-10-26T10:30:00Z"), now)).toBe(false);
    expect(isTakeoverAllowed(new Date("2026-10-26T09:59:00Z"), now)).toBe(true);
  });
});
