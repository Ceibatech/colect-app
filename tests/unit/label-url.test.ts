import { describe, expect, it } from "vitest";
import { labelQrBase, labelScanUrl } from "@/lib/cartons/label-url";
import { coteFromScan } from "@/lib/cartons/scan";

describe("adresse du QR des étiquettes", () => {
  it("pointe vers le SAE dès que LABEL_QR_BASE est défini", () => {
    const base = labelQrBase({ LABEL_QR_BASE: "https://mulcv-dev.ceiba-analytics.com/app/" });
    expect(base).toBe("https://mulcv-dev.ceiba-analytics.com/app");
    expect(labelScanUrl("https://geoarchives.ceiba-analytics.com", "FON-3302-113-0001-012", base))
      .toBe("https://mulcv-dev.ceiba-analytics.com/app/q/FON-3302-113-0001-012");
  });

  it("garde l'adresse GeoArchiv sans configuration et refuse une adresse douteuse", () => {
    expect(labelScanUrl("https://geoarchives.ceiba-analytics.com", "2010-KOU-0001", null)).toBe("https://geoarchives.ceiba-analytics.com/c/2010-KOU-0001");
    expect(labelQrBase({})).toBeNull();
    expect(labelQrBase({ LABEL_QR_BASE: "http://mulcv.example/app" })).toBeNull();
    expect(labelQrBase({ LABEL_QR_BASE: "https://mulcv.example/app?x=1" })).toBeNull();
    expect(labelQrBase({ LABEL_QR_BASE: "pas une adresse" })).toBeNull();
  });

  it("la douchette GeoArchiv lit toujours la cote dans la nouvelle adresse", () => {
    expect(coteFromScan("https://mulcv-dev.ceiba-analytics.com/app/q/2010-KOU-0001-012")).toBe("2010-KOU-0001");
    expect(coteFromScan("https://mulcv-dev.ceiba-analytics.com/app/q/FON-3302-113-0001")).toBe("FON-3302-113-0001");
  });
});
