import { describe, expect, it } from "vitest";
import { parseDossierSearchParams } from "@/lib/validation/dossier-search";

describe("parseDossierSearchParams", () => {
  it("conserve un filtre valide même quand d'autres champs sont des chaînes vides (\"Tous\")", () => {
    const result = parseDossierSearchParams({
      q: "",
      commune: "",
      nature: "3",
      operateur: "",
      statutCollecte: "",
      statutValidation: "",
      statutPreparation: "",
      statutNumerisation: "",
      statutIndexation: "",
      statutArchivage: "",
      from: "",
      to: "",
    });
    expect(result.nature).toBe(3);
    expect(result.commune).toBeUndefined();
    expect(result.statutValidation).toBeUndefined();
  });

  it("applique plusieurs filtres à la fois", () => {
    const result = parseDossierSearchParams({
      commune: "2",
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
    });
    expect(result.commune).toBe(2);
    expect(result.statutValidation).toBe("VALIDE");
    expect(result.statutPreparation).toBe("TERMINE");
  });

  it("retombe sur les valeurs par défaut si une valeur est réellement invalide", () => {
    const result = parseDossierSearchParams({ statutValidation: "STATUT_INEXISTANT" });
    expect(result.statutValidation).toBeUndefined();
    expect(result.page).toBe(1);
  });

  it("retourne les valeurs par défaut quand aucun paramètre n'est fourni", () => {
    const result = parseDossierSearchParams({});
    expect(result.page).toBe(1);
    expect(result.sort).toBe("createdAt");
    expect(result.dir).toBe("desc");
  });
});
