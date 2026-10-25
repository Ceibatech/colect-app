import { describe, expect, it } from "vitest";
import { buildCartonToken, cartonWhereFromToken, getCartonDisplay, parseCartonToken } from "@/lib/workflow/carton-identity";

describe("carton identity", () => {
  it("conserve l'identité après déplacement et modification des anciens libellés", () => {
    const before = { cartonId: 42, siteId: 1, codeBarres: "ANCIEN-1", libelleCarton: null };
    const after = { cartonId: 42, siteId: 9, codeBarres: "MODIFIE", libelleCarton: "Nouveau libellé" };
    expect(buildCartonToken(before)).toBe("carton:42");
    expect(buildCartonToken(after)).toBe("carton:42");
    expect(cartonWhereFromToken("carton:42")).toEqual({ cartonId: 42 });
    expect(parseCartonToken("carton:42")).toEqual({ cartonId: 42, siteId: undefined, codeBarres: null, libelleCarton: null });
  });

  it("ne fusionne pas deux cartons portant le même ancien code", () => {
    const sameLegacy = { siteId: 1, codeBarres: "A-1", libelleCarton: "A" };
    expect(buildCartonToken({ ...sameLegacy, cartonId: 1 })).not.toBe(buildCartonToken({ ...sameLegacy, cartonId: 2 }));
  });

  it("affiche l'identifiant unique avant les repères d'origine", () => {
    expect(getCartonDisplay({ cartonId: 42, codeBarres: "ABC", libelleCarton: "Carton A" }))
      .toEqual({ label: "CTN-00000042", description: "ABC · Carton A" });
    expect(getCartonDisplay({ cartonId: 42, codeBarres: "ABC", libelleCarton: "ABC" }))
      .toEqual({ label: "CTN-00000042", description: "ABC" });
  });

  it.each(["carton:0", "carton:-1", "carton:1.2", "carton:2147483648", "carton:2|site:1", "carton:abc", "carton:"])("refuse l'identifiant physique invalide %s", (token) => {
    expect(parseCartonToken(token)).toBeNull();
    expect(cartonWhereFromToken(token)).toBeNull();
  });

  it("distingue un même code de carton selon le site", () => {
    expect(buildCartonToken({ siteId: 1, codeBarres: "CARTON-01", libelleCarton: null }))
      .not.toBe(buildCartonToken({ siteId: 2, codeBarres: "CARTON-01", libelleCarton: null }));
  });

  it("encode puis restitue les caractères du libellé", () => {
    const token = buildCartonToken({ siteId: null, codeBarres: null, libelleCarton: "Lot A / Mezzanine" });
    expect(token).toBe("site:none|label:Lot%20A%20%2F%20Mezzanine");
    expect(parseCartonToken(token!)).toEqual({ siteId: null, codeBarres: null, libelleCarton: "Lot A / Mezzanine" });
  });

  it("produit une clause Prisma qui ne mélange pas les sites", () => {
    expect(cartonWhereFromToken("site:4|code:A%2F12")).toEqual({ siteId: 4, codeBarres: "A/12" });
    expect(cartonWhereFromToken("site:4|label:LOT-9")).toEqual({ siteId: 4, codeBarres: null, libelleCarton: "LOT-9" });
  });

  it("refuse les jetons invalides et fournit un libellé stable", () => {
    expect(parseCartonToken("site:x|code:ABC")).toBeNull();
    expect(parseCartonToken("site:1|code:")).toBeNull();
    expect(getCartonDisplay({ codeBarres: "CB-1", libelleCarton: "Carton principal" }))
      .toEqual({ label: "CB-1", description: "Carton principal" });
  });
});
