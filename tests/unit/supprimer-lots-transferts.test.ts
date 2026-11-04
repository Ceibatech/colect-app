import { describe, expect, it } from "vitest";
import { chunk, parseLots } from "../../deploy/supprimer-lots-transferts.mjs";

describe("suppression de lots de transfert", () => {
  it("lit une liste de références sans tenir compte de la casse ni des espaces", () => {
    expect(parseLots(" lot-2026-000001, LOT-2026-000002 ")).toEqual(["LOT-2026-000001", "LOT-2026-000002"]);
  });

  it("refuse une liste vide, une référence mal formée ou répétée", () => {
    expect(() => parseLots("")).toThrow("obligatoire");
    expect(() => parseLots(undefined)).toThrow("obligatoire");
    expect(() => parseLots("LOT-2026-1")).toThrow("invalide");
    expect(() => parseLots("2010-KOU-0001")).toThrow("invalide");
    expect(() => parseLots("'; DROP TABLE transfer_lots;--")).toThrow("invalide");
    expect(() => parseLots("LOT-2026-000001,LOT-2026-000001")).toThrow("deux fois");
  });

  it("découpe une liste d'identifiants en lots de taille donnée", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 1000)).toEqual([]);
    expect(chunk(Array.from({ length: 2500 }, (_, i) => i), 1000).map((part) => part.length)).toEqual([1000, 1000, 500]);
  });
});
