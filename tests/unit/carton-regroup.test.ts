import { describe, expect, it } from "vitest";
import { labelKey, legacyKey, planRegroup } from "../../deploy/regroup-cartons.mjs";
import { normalizeCartonLabel } from "@/lib/cartons/identity-normalization";
import { buildCartonLegacyKey } from "@/lib/cartons/persistence";

const SAMPLES = ["Zone 4/C - 2ème rang", "zone4c 2eme RANG", "Anan Cocoteraie  1", "Bâtiment 1er étage", "1 E", "Carton A-12", "3e lot", "Côte d'Ivoire 12ère", ""];

describe("regroupement des cartons par libellé", () => {
  it("utilise exactement la clé de libellé de l'application", () => {
    for (const sample of SAMPLES) expect(labelKey(sample)).toBe(normalizeCartonLabel(sample));
  });

  it("calcule la même clé d'admission que l'application", () => {
    const identity = { siteId: 2, entrepotId: 3, libelleCarton: "Anan Cocoteraie 1", codeBarres: "123" };
    expect(legacyKey(2, 3, normalizeCartonLabel(identity.libelleCarton)!)).toBe(buildCartonLegacyKey(identity));
  });

  it("regroupe les variantes d'un libellé dans le plus ancien CTN de la salle", () => {
    const plan = planRegroup([
      { id: 1, cartonId: 9, siteId: 2, entrepotId: 3, libelleCarton: "Anan Cocoteraie 1" },
      { id: 2, cartonId: 5, siteId: 2, entrepotId: 3, libelleCarton: "ANAN cocoteraie  1" },
      { id: 3, cartonId: 7, siteId: 2, entrepotId: 3, libelleCarton: "anan-cocotéraie 1er" },
      { id: 4, cartonId: 8, siteId: 2, entrepotId: 3, libelleCarton: "Anna Cocoteraie 1" },
      { id: 5, cartonId: 6, siteId: 2, entrepotId: 4, libelleCarton: "Anan Cocoteraie 1" },
    ]);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].target).toBe(5);
    expect(plan.merges[0].moves.map((m: { from: number }) => m.from)).toEqual([7, 9]);
    expect(plan.cartonsAfter).toBe(plan.cartonsBefore - 2);
  });

  it("laisse les libellés génériques et les cartons en transfert", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, cartonId: i + 1, siteId: 1, entrepotId: 1, libelleCarton: "Lotissement Akouédo" }));
    expect(planRegroup(many, { maxDossiers: 4 }).generic).toHaveLength(1);
    expect(planRegroup(many, { maxDossiers: 80, engagedCartonIds: new Set([3]) }).blocked).toHaveLength(1);
  });
});
