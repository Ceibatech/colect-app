import { describe, expect, it } from "vitest";
import {
  buildInventoryCompletenessMetrics,
  type InventoryCompletenessCounts,
} from "@/lib/utils/inventory-completeness";

const completeCounts: InventoryCompletenessCounts = {
  commune: 10,
  lotissement: 10,
  libelleCarton: 10,
  referenceClassement: 10,
  numeroLot: 10,
  natureDossier: 10,
  numeroIlot: 10,
  titreFoncier: 10,
  superficie: 10,
  numeroDdu: 10,
  codeBarres: 10,
  numeroGuichet: 10,
};

describe("buildInventoryCompletenessMetrics", () => {
  it("calcule le renseigné, le manque et le taux pour chaque champ", () => {
    const metrics = buildInventoryCompletenessMetrics(10, {
      ...completeCounts,
      natureDossier: 7,
    });

    expect(metrics).toHaveLength(12);
    expect(metrics.find((metric) => metric.key === "natureDossier")).toMatchObject({
      filled: 7,
      missing: 3,
      rate: 70,
      total: 10,
    });
  });

  it("retourne des taux nuls quand le périmètre ne contient aucun dossier", () => {
    const metrics = buildInventoryCompletenessMetrics(0, completeCounts);

    expect(metrics.every((metric) => metric.filled === 0 && metric.missing === 0 && metric.rate === 0)).toBe(true);
  });

  it("borne défensivement un comptage supérieur au total", () => {
    const [commune] = buildInventoryCompletenessMetrics(5, completeCounts);

    expect(commune).toMatchObject({ filled: 5, missing: 0, rate: 100 });
  });
});
