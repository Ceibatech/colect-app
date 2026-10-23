import { describe, expect, it } from "vitest";
import { buildCartonToken, cartonWhereFromToken, getCartonDisplay, parseCartonToken } from "@/lib/workflow/carton-identity";

describe("carton identity", () => {
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
