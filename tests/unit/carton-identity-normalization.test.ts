import { describe, expect, it } from "vitest";
import {
  boundedEditDistance,
  normalizeCartonCode,
  normalizeCartonIdentity,
  normalizeCartonLabel,
  tidyCartonText,
} from "@/lib/cartons/identity-normalization";
import { buildCartonLegacyKey } from "@/lib/cartons/persistence";

const at = { siteId: 1, entrepotId: 2 };

describe("normalisation de l'identification des cartons", () => {
  it("rapproche les variantes de casse, d'accents et d'espacement d'un libellé", () => {
    const key = normalizeCartonLabel("Anan Cocoteraie 1");
    expect(normalizeCartonLabel("Anan cocoteraie 1")).toBe(key);
    expect(normalizeCartonLabel("  ANAN  Cocoteraie 1 ")).toBe(key);
    expect(normalizeCartonLabel("643-699 zone4/c")).toBe(normalizeCartonLabel("643-699 zone 4/c"));
    expect(normalizeCartonLabel("Élan")).toBe(normalizeCartonLabel("elan"));
  });

  it("ne fusionne ni les fautes de frappe ni les numéros différents", () => {
    expect(normalizeCartonLabel("Anna Cocoteraie 1")).not.toBe(normalizeCartonLabel("Anan Cocoteraie 1"));
    expect(normalizeCartonLabel("Anan Cocoteraie")).not.toBe(normalizeCartonLabel("Anan Cocoteraie 1"));
  });

  it("ignore l'espacement du code-barres mais conserve sa casse", () => {
    expect(normalizeCartonCode(" MAR 100021557 ")).toBe("MAR100021557");
    expect(normalizeCartonCode("mar1")).not.toBe(normalizeCartonCode("MAR1"));
    expect(normalizeCartonCode("   ")).toBeNull();
  });

  it("identifie le carton par son libellé, le code-barres seulement à défaut", () => {
    expect(normalizeCartonIdentity({ codeBarres: " ", libelleCarton: "Box A" })).toEqual({ kind: "label", value: "boxa" });
    expect(normalizeCartonIdentity({ codeBarres: "C 1", libelleCarton: "Box A" })).toEqual({ kind: "label", value: "boxa" });
    expect(normalizeCartonIdentity({ codeBarres: "C 1", libelleCarton: " " })).toEqual({ kind: "code", value: "C1" });
    expect(normalizeCartonIdentity({ codeBarres: null, libelleCarton: " " })).toBeNull();
  });

  it("attribue la même clé d'admission aux variantes d'un même carton, par emplacement", () => {
    const key = buildCartonLegacyKey({ ...at, libelleCarton: "Anan Cocoteraie 1" });
    expect(buildCartonLegacyKey({ ...at, libelleCarton: "anan  cocoteraie 1" })).toBe(key);
    expect(buildCartonLegacyKey({ ...at, entrepotId: 3, libelleCarton: "Anan Cocoteraie 1" })).not.toBe(key);
  });

  it("nettoie l'affichage et mesure les quasi-doublons", () => {
    expect(tidyCartonText("  Anan   Cocoteraie 1 ")).toBe("Anan Cocoteraie 1");
    expect(boundedEditDistance("anna", "anan", 2)).toBe(2);
    expect(boundedEditDistance("anancocoteraie", "anancocoteraie1", 2)).toBe(1);
    expect(boundedEditDistance("abc", "xyzuvw", 2)).toBe(3);
  });
});
