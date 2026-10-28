import { describe, expect, it } from "vitest";
import { normaliserNumero, refusRangement } from "@/lib/caisses/rules";

const caisse = { id: 1, numero: "C-01", siteId: 4, capacite: 40, occupes: 10 };
const pret = { caisseId: null, dossiers: [{ siteId: 4, statutConditionnement: "TERMINE" }] };

describe("rangement des cartons en caisse", () => {
  it("accepte un carton reconditionné du site de la caisse", () => {
    expect(refusRangement(pret, caisse)).toBeNull();
  });
  it("refuse un carton non reconditionné, d'un autre site, déjà rangé ailleurs, ou une caisse pleine", () => {
    expect(refusRangement({ caisseId: null, dossiers: [{ siteId: 4, statutConditionnement: "EN_COURS" }] }, caisse)).toMatch(/Reconditionnement non terminé : 1 dossier/);
    expect(refusRangement({ caisseId: null, dossiers: [{ siteId: 2, statutConditionnement: "TERMINE" }] }, caisse)).toMatch(/site de la caisse/);
    expect(refusRangement({ ...pret, caisseId: 9 }, caisse, "C-09")).toMatch(/C-09/);
    expect(refusRangement(pret, { ...caisse, occupes: 40 })).toMatch(/pleine \(40 cartons\)/);
    expect(refusRangement({ caisseId: null, dossiers: [] }, caisse)).toMatch(/aucun dossier/);
  });
  it("un carton déjà dans cette caisse n'est pas un refus", () => {
    expect(refusRangement({ ...pret, caisseId: 1 }, { ...caisse, occupes: 40 })).toBeNull();
  });
  it("normalise le numéro saisi", () => {
    expect(normaliserNumero("  caisse   01 ")).toBe("CAISSE 01");
    expect(normaliserNumero("C-1/A")).toBe("C-1/A");
    expect(normaliserNumero("")).toBeNull();
    expect(normaliserNumero("<script>")).toBeNull();
  });
});
