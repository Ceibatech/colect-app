import { describe, expect, it } from "vitest";
import { dossierImportFingerprint } from "@/lib/import/dossier-identity";

const dossier = {
  operateurId: 1, communeId: 2, lotissementId: 3, natureDossierId: 4,
  codeBarres: "CARTON-12", libelleCarton: "Salle archives", numeroTitreFoncier: "TF-1",
  nom: "KOUAME", prenoms: "Anne", superficie: 125,
};

describe("déduplication des dossiers importés", () => {
  it("autorise plusieurs dossiers distincts dans le même carton", () => {
    expect(dossierImportFingerprint(dossier)).not.toBe(dossierImportFingerprint({ ...dossier, numeroTitreFoncier: "TF-2" }));
    expect(dossierImportFingerprint(dossier)).not.toBe(dossierImportFingerprint({ ...dossier, nom: "KOFFI" }));
  });
  it("repère une copie exacte malgré les espaces, les accents décomposés et le format décimal", () => {
    expect(dossierImportFingerprint({ ...dossier, prenoms: "Élise", superficie: "125.00" }))
      .toBe(dossierImportFingerprint({ ...dossier, prenoms: " E\u0301lise ", superficie: { toString: () => "125" } }));
  });
  it.each(["operateurId", "communeId", "lotissementId", "natureDossierId"] as const)("respecte le référentiel résolu %s", (field) => {
    expect(dossierImportFingerprint(dossier)).not.toBe(dossierImportFingerprint({ ...dossier, [field]: 99 }));
  });
  it("normalise l'absence de valeur, sans concaténation ambiguë", () => {
    expect(dossierImportFingerprint({ ...dossier, mobile: " " })).toBe(dossierImportFingerprint({ ...dossier, mobile: null }));
    expect(dossierImportFingerprint({ ...dossier, nom: "a|b", prenoms: "c" }))
      .not.toBe(dossierImportFingerprint({ ...dossier, nom: "a", prenoms: "b|c" }));
  });
});
