import { describe, expect, it } from "vitest";
import { cartonCoteOf, formatCartonCote, formatDossierCote, majorityCommune, parseCote, proposeSigle } from "@/lib/cartons/cote";
import { coteFromScan } from "@/lib/cartons/scan";
import { safeReturnPath } from "@/lib/auth/return-path";
import { planCartons, planSigles, proposeSigle as proposeSigleScript } from "../../deploy/assign-cotes.mjs";

describe("cotes du référentiel MULCV", () => {
  it("donne un sigle stable aux communes", () => {
    expect(proposeSigle("Koumassi")).toBe("KOU");
    expect(proposeSigle("Port-Bouët")).toBe("PBT");
    expect(proposeSigle("Marcory")).toBe("MAR");
    expect(proposeSigle("Sikensi")).toBe("SIK");
    expect(proposeSigleScript("Port Bouet")).toBe("PBT");
  });

  it("forme les cotes carton et dossier, n+1 compris", () => {
    const carton = formatCartonCote("2010-KOU", 1);
    expect(carton).toBe("2010-KOU-0001");
    expect(formatDossierCote(carton, 12)).toBe("2010-KOU-0001-012");
    expect(formatDossierCote(carton, 13)).toBe("2010-KOU-0001-013");
    expect(formatDossierCote(carton, 1303)).toBe("2010-KOU-0001-1303");
  });

  it("lit une cote saisie ou scannée", () => {
    expect(parseCote("2010-kou-0001-012")).toEqual({ carton: "2010-KOU-0001", rang: 12 });
    expect(parseCote("2010-KOU-0001")).toEqual({ carton: "2010-KOU-0001", rang: null });
    expect(parseCote("Koumassi")).toBeNull();
    expect(cartonCoteOf("2010-MAR-0042-007")).toBe("2010-MAR-0042");
    expect(coteFromScan("https://geoarchives.ci/c/2010-KOU-0001")).toBe("2010-KOU-0001");
    expect(coteFromScan("2010-KOU-0001-012")).toBe("2010-KOU-0001");
    expect(coteFromScan("CTN-00000012")).toBeNull();
  });

  it("rouvre la fiche du carton après connexion", () => {
    expect(safeReturnPath("/c/2010-KOU-0001")).toBe("/cartons/2010-KOU-0001");
    expect(safeReturnPath("/c/CTN-00000059")).toBe("/cartons/CTN-00000059");
    expect(safeReturnPath("/c/https://evil")).toBe("/dashboard");
  });

  it("retient la commune majoritaire", () => {
    expect(majorityCommune([2, 1, 2, null])).toBe(2);
    expect(majorityCommune([null])).toBeNull();
  });

  it("numérote les cartons par commune, dans l'ordre CTN, à la suite des cotes existantes", () => {
    const sigles = planSigles([{ id: 1, nom: "Koumassi", sigle: null }, { id: 2, nom: "Marcory", sigle: "MAR" }]);
    const plan = planCartons([
      { id: 5, communes: new Map([[1, 3]]) },
      { id: 2, communes: new Map([[2, 1], [1, 4]]) },
      { id: 9, communes: new Map([[2, 2]]) },
    ], sigles, new Map([["2010-MAR", 7]]));
    expect(plan.map((c: { id: number; cote: string }) => [c.id, c.cote])).toEqual([[2, "2010-KOU-0001"], [5, "2010-KOU-0002"], [9, "2010-MAR-0008"]]);
  });
});
