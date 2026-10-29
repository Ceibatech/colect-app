import { describe, expect, it } from "vitest";
import { clean, communeId, dedoublonner, superficie } from "../../deploy/reprise-fiches.mjs";

describe("reprise des fiches terrain", () => {
  it("vide les mentions « rien à signaler »", () => {
    for (const v of ["Ras", "RAS ", "R a s", "N", "Néant", "Néant ", "  "]) expect(clean(v)).toBeNull();
    expect(clean(" Zone 4/C  ")).toBe("Zone 4/C");
  });
  it("lit les superficies écrites à la main", () => {
    expect(superficie("600m²")).toBe(600);
    expect(superficie("800 mètre carré ")).toBe(800);
    expect(superficie("1 303")).toBe(1303);
    expect(superficie(1417)).toBe(1417);
    expect(superficie("Ras")).toBeNull();
  });
  it("reconnaît les communes mal orthographiées", () => {
    const communes = new Map([["koumassi", 1], ["marcory", 2], ["port bouet", 3]]);
    expect(communeId("KOUASSI ", communes)).toBe(1);
    expect(communeId("Abia koumassi", communes)).toBe(1);
    expect(communeId("Port-Bouët", communes)).toBe(3);
    expect(communeId("Ras", communes)).toBeNull();
  });
  it("écarte les doublons exacts en gardant la saisie la plus récente", () => {
    const a = { nom: "Kone", prenoms: "Awa", lot: "12", ilot: "3", libelle: "Zone 4", tf: null, debut: new Date("2026-08-01") };
    const b = { ...a, debut: new Date("2026-09-01"), adresse: "corrigée" };
    expect(dedoublonner([a, b])).toEqual([b]);
  });
});
