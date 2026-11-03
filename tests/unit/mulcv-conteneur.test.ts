import { describe, expect, it } from "vitest";
import { buildPayloads, conteneurId, isMulcvId, MULCV_MAX_CARTONS } from "@/lib/mulcv/conteneur";

const carton = (cote: string | null, n: number) => ({
  cote,
  dossiers: Array.from({ length: n }, (_, i) => ({ cote: cote ? `${cote}-${String(i + 1).padStart(3, "0")}` : null })),
});

describe("envoi des caisses reçues vers MULCV", () => {
  it("le conteneur est le lot suivi de la caisse, au format accepté par MULCV", () => {
    expect(conteneurId("LOT-2026-000007", "C-01")).toBe("LOT-2026-000007-C-01");
    expect(conteneurId("LOT-2026-000007", "CONTENEUR 01")).toBe("LOT-2026-000007-CONTENEUR-01");
    expect(conteneurId("LOT-2026-000007", "C-1/A")).toBe("LOT-2026-000007-C-1-A");
    expect(conteneurId("LOT-2026-000007", null)).toBe("LOT-2026-000007-HORS-CAISSE");
    expect(isMulcvId(conteneurId("LOT-2026-000007", "x".repeat(80)))).toBe(true);
  });

  it("reprend les cotes des cartons et des dossiers, triées, une caisse par conteneur", () => {
    const { payloads } = buildPayloads("LOT-2026-000007", "Zone_Sud", [
      { caisseNumero: "C-01", cartons: [carton("2010-KOU-0202", 2), carton("2010-KOU-0201", 1)] },
      { caisseNumero: "C-02", cartons: [carton("2010-KOU-0203", 1)] },
    ]);
    expect(payloads).toEqual([
      { conteneurId: "LOT-2026-000007-C-01", zone: "Zone_Sud", cartons: [
        { cartonUid: "2010-KOU-0201", dossiers: [{ dossierId: "2010-KOU-0201-001" }] },
        { cartonUid: "2010-KOU-0202", dossiers: [{ dossierId: "2010-KOU-0202-001" }, { dossierId: "2010-KOU-0202-002" }] },
      ] },
      { conteneurId: "LOT-2026-000007-C-02", zone: "Zone_Sud", cartons: [{ cartonUid: "2010-KOU-0203", dossiers: [{ dossierId: "2010-KOU-0203-001" }] }] },
    ]);
  });

  it("écarte et compte ce qui n'a pas de cote, sans bloquer le reste", () => {
    const result = buildPayloads("LOT-2026-000007", "Zone_Sud", [
      { caisseNumero: "C-01", cartons: [carton(null, 3), { cote: "2010-KOU-0201", dossiers: [{ cote: "2010-KOU-0201-001" }, { cote: null }] }] },
    ]);
    expect(result.skippedCartons).toBe(1);
    expect(result.skippedDossiers).toBe(4);
    expect(result.payloads[0].cartons).toEqual([{ cartonUid: "2010-KOU-0201", dossiers: [{ dossierId: "2010-KOU-0201-001" }] }]);
  });

  it("regroupe les cartons hors caisse par 40 et découpe un envoi trop gros", () => {
    const loose = Array.from({ length: 41 }, (_, i) => carton(`2010-KOU-${String(i + 1).padStart(4, "0")}`, 1));
    const { payloads } = buildPayloads("LOT-2026-000007", "Zone_Sud", [{ caisseNumero: null, cartons: loose }]);
    expect(payloads.map((p) => [p.conteneurId, p.cartons.length])).toEqual([
      ["LOT-2026-000007-HORS-CAISSE-1", MULCV_MAX_CARTONS], ["LOT-2026-000007-HORS-CAISSE-2", 1],
    ]);
    const heavy = buildPayloads("LOT-2026-000007", "Zone_Sud", [{ caisseNumero: "C-09", cartons: [carton("2010-KOU-0001", 450), carton("2010-KOU-0002", 450), carton("2010-KOU-0003", 450), carton("2010-KOU-0004", 450), carton("2010-KOU-0005", 450)] }]);
    expect(heavy.payloads.map((p) => p.cartons.length)).toEqual([4, 1]);
    expect(new Set(heavy.payloads.map((p) => p.conteneurId))).toEqual(new Set(["LOT-2026-000007-C-09"]));
  });
});
