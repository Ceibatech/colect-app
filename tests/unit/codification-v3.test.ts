import { describe, expect, it } from "vitest";
import {
  COMMUNES_CI, RUBRIQUES_V3, communeCiParIdentifiant, communeCiParNom, findRubriqueV3, rubriquePourCommune,
} from "@/lib/referentiel/codification";
import { cotePrefixeNouveau, formatCartonCote, formatDossierCote, parseCoteDetail } from "@/lib/cartons/cote";

describe("codification FONCTION V3", () => {
  it("reprend les 201 communes du référentiel RGPH avec un identifiant unique à 3 chiffres", () => {
    expect(COMMUNES_CI).toHaveLength(201);
    expect(new Set(COMMUNES_CI.map((c) => c.identifiant)).size).toBe(201);
    expect(COMMUNES_CI.every((c) => /^\d{3}$/.test(c.identifiant))).toBe(true);
    expect(communeCiParIdentifiant("113")?.nom).toBe("KOUMASSI");
  });

  it("reconnaît les communes de la base à leur nom, quelle qu'en soit l'écriture", () => {
    expect(communeCiParNom("Koumassi")?.identifiant).toBe("113");
    expect(communeCiParNom("Port Bouet")?.identifiant).toBe("147");
    expect(communeCiParNom("PORT-BOUËT")?.identifiant).toBe("147");
    expect(communeCiParNom("Cocody")?.identifiant).toBe("048");
    expect(communeCiParNom("Assinie Mafia")?.identifiant).toBe("016");
    expect(communeCiParNom("Commune Démo Nord")).toBeNull();
  });

  it("reprend les 197 rubriques V3, chacune rattachée à une fonction", () => {
    expect(RUBRIQUES_V3).toHaveLength(197);
    expect(new Set(RUBRIQUES_V3.map((r) => r.key)).size).toBe(197);
    expect(findRubriqueV3("FON-3302")?.libelle).toBe("Dossiers ACD");
    expect(findRubriqueV3("2010")?.key).toBe("FON-3302");
    expect(findRubriqueV3("TOP-3202")?.libelle).toBe("Dossiers d’état des lieux");
    expect(findRubriqueV3("FON-9999")).toBeNull();
  });

  it("code les ACD des communes à direction régionale dans leur rubrique 7x12", () => {
    expect(rubriquePourCommune("FON-3302", "113")).toBe("FON-3302");
    expect(rubriquePourCommune("FON-3302", "083")).toBe("FON-7102");
    expect(rubriquePourCommune("FON-3302", "196")).toBe("FON-7012");
    expect(rubriquePourCommune("CON-7015", "196")).toBe("CON-7015");
  });

  it("forme les cotes des exemples du document", () => {
    const carton = formatCartonCote(cotePrefixeNouveau("FON", "3302", "113")!, 1);
    expect(carton).toBe("FON-3302-113-0001");
    expect(formatDossierCote(carton, 12)).toBe("FON-3302-113-0001-012");
    expect(parseCoteDetail("RH-2101-146-0001-020")).toMatchObject({ fonction: "RH", rubrique: "2101", commune: "146", rang: 20 });
  });
});
