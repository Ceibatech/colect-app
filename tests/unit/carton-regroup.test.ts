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
    expect(legacyKey(2, normalizeCartonLabel(identity.libelleCarton)!)).toBe(buildCartonLegacyKey(identity));
    expect(buildCartonLegacyKey({ ...identity, entrepotId: 9 })).toBe(buildCartonLegacyKey(identity));
  });

  it("regroupe les variantes d'un libellé du même site dans le plus ancien CTN, quelle que soit la salle", () => {
    const plan = planRegroup([
      { id: 1, cartonId: 9, siteId: 2, entrepotId: 3, libelleCarton: "Anan Cocoteraie 1" },
      { id: 2, cartonId: 5, siteId: 2, entrepotId: 3, libelleCarton: "ANAN cocoteraie  1" },
      { id: 3, cartonId: 7, siteId: 2, entrepotId: 3, libelleCarton: "anan-cocotéraie 1er" },
      { id: 4, cartonId: 8, siteId: 2, entrepotId: 3, libelleCarton: "Anna Cocoteraie 1" },
      { id: 5, cartonId: 6, siteId: 2, entrepotId: 4, libelleCarton: "Anan Cocoteraie 1" },
      { id: 6, cartonId: 4, siteId: 1, entrepotId: 1, libelleCarton: "Anan Cocoteraie 1" },
    ]);
    expect(plan.merges).toHaveLength(1);
    expect(plan.merges[0].target).toBe(5);
    expect(plan.merges[0].moves.map((m: { from: number }) => m.from)).toEqual([6, 7, 9]);
    // Rangé dans la salle majoritaire (3) : le dossier saisi en salle 4 y est aligné.
    expect(plan.merges[0].entrepotId).toBe(3);
    expect(plan.merges[0].relocate).toEqual([5]);
    expect(plan.cartonsAfter).toBe(plan.cartonsBefore - 3);
  });

  it("laisse les libellés génériques et les cartons en transfert", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, cartonId: i + 1, siteId: 1, entrepotId: 1, libelleCarton: "Lotissement Akouédo" }));
    expect(planRegroup(many, { maxDossiers: 4 }).generic).toHaveLength(1);
    expect(planRegroup(many, { maxDossiers: 80, engagedCartonIds: new Set([3]) }).blocked).toHaveLength(1);
  });
});

import { clusterLabels } from "../../deploy/regroup-cartons.mjs";

describe("regroupement intelligent des libellés", () => {
  const cluster = (labels: string[], max = 80) => {
    const { keyOf } = clusterLabels(labels.map((label) => ({ siteId: 1, label, count: 2 })), max);
    return labels.map((label) => keyOf.get(`1|${label}`));
  };

  it("ignore les unités, les mots de liaison et les fautes légères", () => {
    const [a, b] = cluster(["Zone 4/c superficie 4991m2-52918m2", "Zone 4/c superficie 4991-52918m2"]);
    expect(a).toBe(b);
    const [c, d, e] = cluster(["Zone 4/C complementaire lots 95-146", "Zone 4/C complémentaire 95-146", "Zone 4/C complementair 95-146"]);
    expect(new Set([c, d, e]).size).toBe(1);
    const [f, g] = cluster(["Marcory Alliodan", "MARCORY ALIODAN"]);
    expect(f).toBe(g);
  });

  it("ne fusionne jamais des repères différents", () => {
    const pairs = [["ABEKAN BERNARD 32", "ABEKAN BERNARD 33"], ["Koumassi remblai I", "Koumassi remblai II"], ["Zone 4/B", "Zone 4/C"], ["391-399", "391-398"]];
    for (const pair of pairs) {
      const [a, b] = cluster(pair);
      expect(a).not.toBe(b);
    }
  });

  it("n'agrandit pas un groupe au-delà du seuil", () => {
    const { keyOf } = clusterLabels([{ siteId: 1, label: "Marcory Alliodan", count: 60 }, { siteId: 1, label: "MARCORY ALIODAN", count: 30 }], 80);
    expect(keyOf.get("1|Marcory Alliodan")).not.toBe(keyOf.get("1|MARCORY ALIODAN"));
  });
});
