import { describe, expect, it } from "vitest";
import { cartonIdFromScan } from "@/lib/cartons/scan";

describe("lecture d'un QR code de carton", () => {
  it("reconnaît l'adresse du QR code, la référence seule et la casse", () => {
    expect(cartonIdFromScan("https://geoarchives.ceiba-analytics.com/c/CTN-00000123")).toBe(123);
    expect(cartonIdFromScan(" CTN-00000123 ")).toBe(123);
    expect(cartonIdFromScan("ctn-00000123")).toBe(123);
  });

  it("laisse les autres saisies à la recherche", () => {
    expect(cartonIdFromScan("Anan Cocoteraie 1")).toBeNull();
    expect(cartonIdFromScan("8185708068459")).toBeNull();
    expect(cartonIdFromScan("")).toBeNull();
  });
});

import { safeReturnPath } from "@/lib/auth/return-path";

describe("retour après connexion", () => {
  it("rouvre la fiche du carton scanné", () => {
    expect(safeReturnPath("/c/CTN-00000059")).toBe("/cartons/CTN-00000059");
    expect(safeReturnPath("/cartons/CTN-00000059")).toBe("/cartons/CTN-00000059");
  });

  it("refuse toute autre destination", () => {
    for (const value of ["//evil.example", "https://evil.example/c/CTN-00000059", "/administration", "/c/CTN-1", undefined, null]) {
      expect(safeReturnPath(value)).toBe("/dashboard");
    }
  });
});
