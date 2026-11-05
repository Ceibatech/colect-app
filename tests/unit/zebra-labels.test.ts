import { describe, expect, it } from "vitest";
import { cartonZpl, dossierZpl, reperesDossier, rollSize, zplText } from "@/lib/cartons/zebra-labels";

const url = "https://geoarchives.ceiba-analytics.com/c/FON-3302-113-0001";

describe("étiquettes pour imprimante Zebra (203 dpi)", () => {
  it("borne le format du rouleau aux capacités de l'imprimante", () => {
    expect(rollSize("carton")).toEqual({ largeur: 100, hauteur: 50 });
    expect(rollSize("dossier")).toEqual({ largeur: 60, hauteur: 30 });
    expect(rollSize("carton", "76", "51")).toEqual({ largeur: 76, hauteur: 51 });
    expect(rollSize("carton", "150", "5")).toEqual({ largeur: 100, hauteur: 50 });
  });

  it("produit une étiquette de carton ZPL au format du rouleau, QR compris", () => {
    const zpl = cartonZpl({ reference: "FON-3302-113-0001", url, libelle: "lots 16-116", lieu: "Site ministère · Dépôt Nord" }, rollSize("carton"));
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trim().endsWith("^XZ")).toBe(true);
    expect(zpl).toContain("^PW800");
    expect(zpl).toContain("^LL400");
    expect(zpl).toContain("^CI28");
    expect(zpl).toMatch(/\^BQN,2,\d+\^FDQA,https:\/\/geoarchives\.ceiba-analytics\.com\/c\/FON-3302-113-0001\^FS/);
    expect(zpl).toContain("^FDFON-3302-113-0001^FS");
  });

  it("garde le QR dans la hauteur de l'étiquette", () => {
    for (const [kind, size] of [["carton", rollSize("carton")], ["dossier", rollSize("dossier")]] as const) {
      const zpl = kind === "carton"
        ? cartonZpl({ reference: "FON-3302-113-0001", url, libelle: null, lieu: null }, size)
        : dossierZpl({ code: "FON-3302-113-0001-012", url, rang: 12, reperes: "Îlot 522 · Lot 844", reference: "DOS-1" }, size);
      const mag = Number(/\^BQN,2,(\d+)/.exec(zpl)![1]);
      // 37 modules au plus (version 5) + zone de silence : tient dans la hauteur, marges comprises.
      expect(41 * mag).toBeLessThanOrEqual(size.hauteur * 8);
      expect(mag).toBeGreaterThanOrEqual(kind === "carton" ? 7 : 4);
    }
  });

  it("n'imprime jamais de nom : cote, rang et repères de collage seulement", () => {
    const zpl = dossierZpl({ code: "FON-3302-113-0001-012", url, rang: 12, reperes: reperesDossier({ numeroIlot: "522", numeroLot: "844", numeroTitreFoncier: null }), reference: "DOS-1" }, rollSize("dossier"));
    expect(zpl).toContain("^FDDossier n° 12^FS");
    expect(zpl).toContain("Îlot 522 · Lot 844");
    expect(reperesDossier({})).toBe("Sans îlot ni lot");
    expect(reperesDossier({ numeroTitreFoncier: "TF-4947703" })).toBe("TF-4947703");
    expect(reperesDossier({ numeroTitreFoncier: "4947703" })).toBe("TF 4947703");
  });

  it("neutralise les caractères de commande ZPL dans les textes", () => {
    expect(zplText("lots ^XZ 16~JA\\x")).toBe("lots XZ 16 JA x");
  });
});
