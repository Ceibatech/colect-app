import { describe, expect, it } from "vitest";
import { extractActiveCartonValues, getActiveCartonLabel, hasActiveCartonIdentity } from "@/lib/utils/carton-prefill";
import type { DossierFormValues } from "@/lib/validation/dossier";

describe("carton carry-over", () => {
  it("keeps carton fields and clears dossier-specific data", () => {
    const values: DossierFormValues = {
      siteId: 4,
      entrepotId: 7,
      operateurId: 2,
      libelleCarton: "Carton A-12",
      codeBarres: "CRT-0012",
      numeroGuichet: "G-08",
      numeroDdu: "DGLPI",
      numeroDirectionService: "42",
      referenceClassement: "REF-CARTON",
      etatCarton: "DEGRADE",
      etatCartonDescription: "Coin abime",
      numeroLot: "LOT-99",
      natureDossierId: 3,
      nom: "Kouadio",
      prenoms: "Aya",
      telephone: "0102030405",
      observations: "Ne doit pas etre recopie",
    };

    expect(extractActiveCartonValues(values)).toEqual({
      siteId: 4,
      entrepotId: 7,
      operateurId: 2,
      libelleCarton: "Carton A-12",
      codeBarres: "CRT-0012",
      numeroGuichet: "G-08",
      numeroDdu: "DGLPI",
      numeroDirectionService: "42",
      referenceClassement: "REF-CARTON",
      etatCarton: "DEGRADE",
      etatCartonDescription: "Coin abime",
    });
  });

  it("requires a label or barcode before continuing a carton", () => {
    expect(hasActiveCartonIdentity({ siteId: 1 })).toBe(false);
    expect(hasActiveCartonIdentity({ libelleCarton: "Carton B" })).toBe(true);
    expect(hasActiveCartonIdentity({ codeBarres: "CRT-B" })).toBe(true);
  });

  it("uses the label first for the active-carton summary", () => {
    expect(getActiveCartonLabel({ libelleCarton: "Carton C", codeBarres: "CRT-C" })).toBe("Carton C");
    expect(getActiveCartonLabel({ codeBarres: "CRT-C" })).toBe("CRT-C");
  });
});
