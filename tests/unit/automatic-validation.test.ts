import { describe, expect, it } from "vitest";
import {
  decideDossierIndexationStatus,
  evaluateInventorySubmission,
} from "@/lib/workflow/automatic-validation";

const validInput = {
  codeBarres: "GA-2026-0001",
  duplicateBarcode: false,
  siteId: 1,
  entrepotId: 2,
  entrepotSiteId: 1,
  etatCarton: "BON_ETAT" as const,
  etatCartonDescription: null,
  etatDossier: "BON_ETAT" as const,
  etatDossierDescription: null,
};

describe("evaluateInventorySubmission", () => {
  it("valide automatiquement une fiche cohérente", () => {
    expect(evaluateInventorySubmission(validInput)).toEqual({
      autoValidated: true,
      score: 100,
      issues: [],
    });
  });

  it("oriente un code-barres absent vers le contrôle humain", () => {
    const decision = evaluateInventorySubmission({ ...validInput, codeBarres: null });

    expect(decision.autoValidated).toBe(false);
    expect(decision.issues).toContainEqual(expect.objectContaining({ champ: "codeBarres", type: "CHAMP_MANQUANT" }));
  });

  it("détecte les doublons et les constats physiques incomplets", () => {
    const decision = evaluateInventorySubmission({
      ...validInput,
      duplicateBarcode: true,
      etatCarton: "DEGRADE",
      etatCartonDescription: "",
      etatDossier: "DEGRADE",
      etatDossierDescription: null,
    });

    expect(decision.autoValidated).toBe(false);
    expect(decision.issues.map((issue) => issue.champ)).toEqual([
      "codeBarres",
      "etatCartonDescription",
      "etatDossierDescription",
    ]);
  });

  it("refuse un entrepôt rattaché à un autre site", () => {
    const decision = evaluateInventorySubmission({ ...validInput, entrepotSiteId: 99 });

    expect(decision.autoValidated).toBe(false);
    expect(decision.issues).toContainEqual(expect.objectContaining({ champ: "entrepotId", type: "INCOHERENCE" }));
  });
});

describe("decideDossierIndexationStatus", () => {
  it("reste en cours tant qu'un fichier est encore traité", () => {
    expect(decideDossierIndexationStatus(["INDEXE", "DEUXIEME_LECTURE"])).toBe("EN_COURS");
  });

  it("ne remonte au superviseur que les exceptions terminales", () => {
    expect(decideDossierIndexationStatus(["INDEXE", "A_REQUALIFIER"])).toBe("A_VALIDER");
    expect(decideDossierIndexationStatus(["ERREUR"])).toBe("A_VALIDER");
  });

  it("termine automatiquement lorsque tous les fichiers sont indexés", () => {
    expect(decideDossierIndexationStatus(["INDEXE", "INDEXE"])).toBe("TERMINE");
    expect(decideDossierIndexationStatus([])).toBeNull();
  });
});
