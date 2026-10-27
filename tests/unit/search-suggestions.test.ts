import { describe, expect, it } from "vitest";
import { cartonHref, cartonIdFromQuery, dossierHref, matchScore, queryWords } from "@/lib/search/suggestions";

describe("recherche au fil de la frappe", () => {
  it("retire accents, ponctuation et mots vides", () => {
    expect(queryWords("Lots de  Koumassi, Zone 4/C")).toEqual(["lots", "koumassi", "zone", "4", "c"]);
    expect(queryWords("Abékan  et Bernard")).toEqual(["abekan", "bernard"]);
  });

  it("reconnaît une référence de carton, pas un nombre seul", () => {
    expect(cartonIdFromQuery("CTN-00000115")).toBe(115);
    expect(cartonIdFromQuery("ctn 115")).toBe(115);
    expect(cartonIdFromQuery("115")).toBeNull();
    expect(cartonIdFromQuery("Koumassi")).toBeNull();
  });

  it("classe par nombre de mots trouvés", () => {
    expect(matchScore("Zone 4/C 595-599", ["zone", "595", "koumassi"])).toBe(2);
  });

  it("ouvre le carton dans la file, ou la fiche du dossier aux étapes finales", () => {
    expect(cartonHref("conditionnement", 12)).toBe("/conditionnement?statut=TOUS&carton=carton%3A12");
    expect(cartonHref("indexation", 12)).toBe("/indexation?statut=TOUS&q=CTN-00000012");
    expect(dossierHref("numerisation", { id: 5, cartonId: 12, reference: "D-1" })).toBe("/numerisation?statut=TOUS&carton=carton%3A12");
    expect(dossierHref("archivage", { id: 5, cartonId: 12, reference: "D-1" })).toBe("/dossiers/5?tab=archivage&from=archivage");
  });
});
