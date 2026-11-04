import { describe, expect, it } from "vitest";
import { COTE_PREFIXE_PATTERN, FONCTIONS, cartonCoteOf, communeIdentifiant, cotePrefixeNouveau, parseCote, parseCoteDetail } from "@/lib/cartons/cote";
import { coteFromScan } from "@/lib/cartons/scan";
import { safeReturnPath } from "@/lib/auth/return-path";
import { parseCoteRange } from "@/lib/transfers/carton-selection";
import { rubriqueOfCote } from "@/lib/referentiel/classement";

describe("nouvelle codification FON-3302-113-0001", () => {
  it("lit une cote carton ou dossier du nouveau format", () => {
    expect(parseCote("fon-3302-113-0001-012")).toEqual({ carton: "FON-3302-113-0001", rang: 12 });
    expect(parseCote("FON-3302-113-0001")).toEqual({ carton: "FON-3302-113-0001", rang: null });
    expect(parseCote("SI-2601-146-0001")).toEqual({ carton: "SI-2601-146-0001", rang: null });
    expect(cartonCoteOf("RH-2101-146-0001-020")).toBe("RH-2101-146-0001");
  });

  it("garde l'ancien format lisible", () => {
    expect(parseCote("2010-kou-0001-012")).toEqual({ carton: "2010-KOU-0001", rang: 12 });
    expect(cartonCoteOf("2010-KOU-0001-012")).toBe("2010-KOU-0001");
  });

  it("détaille chaque segment", () => {
    expect(parseCoteDetail("FON-3302-113-0001-012")).toEqual({
      format: "nouveau", carton: "FON-3302-113-0001", prefixe: "FON-3302-113", rubrique: "3302", fonction: "FON", commune: "113", rang: 12,
    });
    expect(parseCoteDetail("2010-KOU-0001")).toEqual({
      format: "ancien", carton: "2010-KOU-0001", prefixe: "2010-KOU", rubrique: "2010", fonction: null, commune: "KOU", rang: null,
    });
  });

  it("refuse une cote mal formée", () => {
    expect(parseCote("FON-3302-13-0001")).toBeNull();
    expect(parseCote("FONX-3302-113-0001")).toBeNull();
    expect(parseCote("3302-113-0001")).toBeNull();
    expect(parseCote("FON-3302-113")).toBeNull();
    expect(parseCote("n'importe quoi")).toBeNull();
  });

  it("tire l'identifiant de commune du code de la commune", () => {
    expect(communeIdentifiant("CI-113")).toBe("113");
    expect(communeIdentifiant("ci-048")).toBe("048");
    expect(communeIdentifiant("CI-13")).toBeNull();
    expect(communeIdentifiant("KOU")).toBeNull();
    expect(communeIdentifiant(null)).toBeNull();
  });

  it("forme le préfixe d'une cote et vérifie la fonction", () => {
    expect(FONCTIONS).toHaveLength(14);
    expect(cotePrefixeNouveau("FON", "3302", "113")).toBe("FON-3302-113");
    expect(cotePrefixeNouveau("fon", "3302", "113")).toBe("FON-3302-113");
    expect(cotePrefixeNouveau("XYZ", "3302", "113")).toBeNull();
    expect(cotePrefixeNouveau("FON", "3302", "13")).toBeNull();
    expect(cotePrefixeNouveau("FON", "33", "113")).toBeNull();
  });

  it("reconnaît le préfixe des deux formats", () => {
    const prefixe = new RegExp(`^${COTE_PREFIXE_PATTERN}$`);
    expect(prefixe.test("FON-3302-113")).toBe(true);
    expect(prefixe.test("2010-KOU")).toBe(true);
    expect(prefixe.test("FON-3302")).toBe(false);
  });

  it("lit le QR code et le chemin de retour après connexion", () => {
    expect(coteFromScan("https://geoarchives.ci/c/FON-3302-113-0001-012")).toBe("FON-3302-113-0001");
    expect(safeReturnPath("/c/FON-3302-113-0001")).toBe("/cartons/FON-3302-113-0001");
    expect(safeReturnPath("/c/fon-3302-113-0001-012")).toBe("/cartons/FON-3302-113-0001-012");
    expect(safeReturnPath("/cartons/FON-3302-113-0001")).toBe("/cartons/FON-3302-113-0001");
    expect(safeReturnPath("/c/2010-KOU-0001")).toBe("/cartons/2010-KOU-0001");
    expect(safeReturnPath("/c/FON-3302-13-0001")).toBe("/dashboard");
  });

  it("lit une plage de cotes dans la recherche d'un transfert", () => {
    const attendu = { prefix: "FON-3302-113", from: 1, to: 200 };
    expect(parseCoteRange("FON-3302-113-0001 à 0200")).toEqual(attendu);
    expect(parseCoteRange("fon-3302-113-0001 - FON-3302-113-0200")).toEqual(attendu);
    expect(parseCoteRange("FON-3302-113-0001..0200")).toEqual(attendu);
    expect(parseCoteRange("FON-3302-113-0001 à FON-3302-127-0200")).toBeNull();
    expect(parseCoteRange("FON-3302-113-0200 à 0001")).toBeNull();
    expect(parseCoteRange("2010-KOU-0001 à 0200")).toEqual({ prefix: "2010-KOU", from: 1, to: 200 });
  });

  it("trouve la rubrique sans échouer quand elle n'est pas dans le référentiel", () => {
    expect(rubriqueOfCote("2010-KOU-0001-012")?.code).toBe("2010");
    expect(() => rubriqueOfCote("FON-3302-113-0001")).not.toThrow();
    expect(rubriqueOfCote("n'importe quoi")).toBeNull();
    expect(rubriqueOfCote(null)).toBeNull();
  });
});
