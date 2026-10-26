import { describe, expect, it } from "vitest";
// Script de maintenance en JavaScript.
import { matchSalles } from "../../deploy/align-dossier-salle.mjs";

const salles = [
  { id: 1, nom: "Tour D Mezzanine", code: "PLT-TD-MEZ", localisation: "Plateau" },
  { id: 2, nom: "Salle 1", code: "PLT-S1", localisation: null },
  { id: 3, nom: "MULCV-PLATEAU", code: "PLT-MULCV", localisation: "Tour D, rez-de-chaussée" },
];

describe("rangement des dossiers dans une salle", () => {
  it("retrouve la salle sans tenir compte de la casse ni des accents", () => {
    expect(matchSalles(salles, "tour d mezzanine").map((s: { id: number }) => s.id)).toEqual([1]);
    expect(matchSalles(salles, "Mézzanine").map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it("signale une recherche ambiguë", () => {
    expect(matchSalles(salles, "tour d")).toHaveLength(2);
    expect(matchSalles(salles, "")).toHaveLength(0);
  });
});
