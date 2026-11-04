import { describe, expect, it } from "vitest";
import { blockers, parseCartons } from "../../deploy/supprimer-donnees-test.mjs";

describe("suppression de données de test", () => {
  it("lit une liste de cotes sans tenir compte de la casse ni des espaces", () => {
    expect(parseCartons(" 2010-abs-0001, 2010-ADZ-0001 ")).toEqual(["2010-ABS-0001", "2010-ADZ-0001"]);
  });

  it("refuse une liste vide, une cote mal formée ou répétée", () => {
    expect(() => parseCartons("")).toThrow("obligatoire");
    expect(() => parseCartons(undefined)).toThrow("obligatoire");
    expect(() => parseCartons("2010 ABS 0001")).toThrow("Cote invalide");
    expect(() => parseCartons("'; DROP TABLE cartons;--")).toThrow("Cote invalide");
    expect(() => parseCartons("2010-ABS-0001,2010-ABS-0001")).toThrow("deux fois");
  });

  it("signale uniquement les liens qui interdisent la suppression", () => {
    expect(blockers({})).toEqual([]);
    expect(blockers({ documents: 0, lotDossiers: 0, caisse: 0 })).toEqual([]);
    expect(blockers({ documents: 2, lotItems: 1, caisse: 1 })).toEqual(["2 documents", "1 cartons engagés dans un lot", "1 conteneur"]);
  });
});
