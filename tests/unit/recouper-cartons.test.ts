import { describe, expect, it } from "vitest";
import { formatDossierCote, norm, planRecoupe } from "../../deploy/recouper-cartons.mjs";

type Plan = { boites: Array<{ cote: string; listeRef: number | null; reference: string | null; dossiers: Array<{ id: number }> }>; partagees: number[] };
const d = (id: number, cartonId: number, reference: string | null, ancienneCote = "2010-KOU-0001", rang: number | null = id) => ({ id, cartonId, reference, ancienneCote, rang });

describe("recoupe des cartons sur les boîtes physiques", () => {
  it("normalise « Lots 16 - 116 » comme « lots 16-116 »", () => {
    expect(norm("Lots 16 - 116")).toBe(norm("lots 16-116"));
    expect(norm("Îlots 155 TF:11539")).toBe("ilot 155 tf 11539");
  });

  it("cote d'abord les boîtes de la liste dans leur ordre, même vides, puis les autres", () => {
    const dossiers = [d(1, 10, "lots 1-9"), d(2, 10, "lots 16-116"), d(3, 10, "Lots 16 - 116"), d(4, 11, null, "2010-KOU-0002"), d(5, 10, "lots 300-310")];
    const plan = planRecoupe(dossiers, [{ ref: 1, libelle: "lots 16-116" }, { ref: 2, libelle: "lots 999-1000" }, { ref: 3, libelle: "lots 1-9" }]) as unknown as Plan;
    expect(plan.boites.map((b) => [b.cote, b.listeRef, b.dossiers.map((x) => x.id)])).toEqual([
      ["2010-KOU-0001", 1, [2, 3]],
      ["2010-KOU-0002", 2, []],
      ["2010-KOU-0003", 3, [1]],
      ["2010-KOU-0004", null, [5]],
      ["2010-KOU-0005", null, [4]],
    ]);
  });

  it("une référence partagée par deux boîtes de la liste va à la première ; la seconde est signalée", () => {
    const plan = planRecoupe([d(1, 10, "lots 296-426")], [{ ref: 2, libelle: "lots 296-426" }, { ref: 3, libelle: "lots 296-426" }]) as unknown as Plan;
    expect(plan.boites[0].dossiers).toHaveLength(1);
    expect(plan.boites[1].dossiers).toHaveLength(0);
    expect(plan.partagees).toEqual([3]);
  });

  it("numérote les dossiers sans trou", () => {
    expect(formatDossierCote("2010-KOU-0001", 12)).toBe("2010-KOU-0001-012");
    expect(formatDossierCote("2010-KOU-0001", 1203)).toBe("2010-KOU-0001-1203");
  });
});
