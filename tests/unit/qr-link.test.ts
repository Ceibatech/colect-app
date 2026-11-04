import { describe, expect, it } from "vitest";
import { DEFAULT_QR_LINK_TEMPLATE, qrLink } from "@/lib/cartons/qr-link";
import { cartonKeyFromScan, coteFromScan } from "@/lib/cartons/scan";

describe("lien des QR codes vers MULCV", () => {
  it("mène à la page de scan du portail MULCV, pas à GeoArchives", () => {
    const link = qrLink("2010-KOU-0001-012");
    expect(link).toBe("https://mulcv-dev.ceiba-analytics.com/app/portal/conteneurs?etiquette=2010-KOU-0001-012");
    expect(link).not.toContain("geoarchives");
  });

  it("suit le modèle configuré et retombe sur le défaut s'il est invalide", () => {
    expect(qrLink("FON-3302-113-0001", "https://mulcv.ceiba-analytics.com/app/portal/conteneurs/{ref}")).toBe("https://mulcv.ceiba-analytics.com/app/portal/conteneurs/FON-3302-113-0001");
    expect(qrLink("2010-KOU-0001", "https://exemple.test/sans-reference")).toBe(DEFAULT_QR_LINK_TEMPLATE.replace("{ref}", "2010-KOU-0001"));
  });

  it("reste lisible par le scanner de GeoArchives", () => {
    expect(coteFromScan(qrLink("2010-KOU-0001-012"))).toBe("2010-KOU-0001");
    expect(coteFromScan(qrLink("FON-3302-113-0042"))).toBe("FON-3302-113-0042");
    expect(cartonKeyFromScan(qrLink("CTN-00000123")).id).toBe(123);
    // Les étiquettes déjà imprimées (lien GeoArchives) restent lues.
    expect(coteFromScan("https://geoarchives.ceiba-analytics.com/c/2010-KOU-0201")).toBe("2010-KOU-0201");
  });
});
