import { describe, expect, it } from "vitest";
import {
  canonicalizeCommuneLabel,
  canonicalizeLotissementLabel,
  expectedCommuneForLotissement,
  localityMatchKey,
} from "@/lib/utils/locality-normalization";

describe("locality normalization", () => {
  it.each([
    "ZONE 4/C",
    "Zone 4 / C",
    "Zone 4 /C",
    "zone4/c",
    "Zone 4/C complémentaire",
    "Zone 4c complémentaire 3ème tranche",
  ])("fusionne %s sous ZONE 4/C", (value) => {
    expect(canonicalizeLotissementLabel(value)).toBe("ZONE 4/C");
    expect(expectedCommuneForLotissement(value)).toBe("Marcory");
  });

  it.each([
    ["Zone 3 marcory", "ZONE 3"],
    ["Marcory remblais", "REMBLAIS"],
    ["remblai", "REMBLAIS"],
    ["remblais", "REMBLAIS"],
  ])("normalise %s en %s", (value, expected) => {
    expect(canonicalizeLotissementLabel(value)).toBe(expected);
    expect(expectedCommuneForLotissement(value)).toBe("Marcory");
  });

  it("préserve une distinction métier non déclarée comme alias", () => {
    expect(canonicalizeLotissementLabel("ZONE 4/C TYPE I")).toBe("ZONE 4/C TYPE I");
    expect(canonicalizeLotissementLabel("ZONE 4 /C TYPE I")).toBe("ZONE 4/C TYPE I");
  });

  it("met une nouvelle localité en majuscules sans en changer le sens", () => {
    expect(canonicalizeLotissementLabel("  Riviera golf  ")).toBe("RIVIERA GOLF");
  });

  it.each([
    ["REMBLAI", "Marcory"],
    ["REMBLAIS", "Marcory"],
    ["Zone 3 Marcory", "Marcory"],
    ["KOULASSI", "Koumassi"],
    ["KOU", "Koumassi"],
    ["PORY BOUET", "Port Bouet"],
    ["PORT BOUET VRIDI", "Port Bouet"],
  ])("rattache la commune %s à %s", (value, expected) => {
    expect(canonicalizeCommuneLabel(value)).toBe(expected);
  });

  it("absorbe la casse, les accents et la ponctuation", () => {
    expect(localityMatchKey("  Zone 4/C complémentaire ")).toBe("ZONE 4 C COMPLEMENTAIRE");
  });
});
