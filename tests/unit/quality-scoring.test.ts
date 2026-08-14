import { describe, expect, it } from "vitest";
import { scoreDossier, QUALITY_FIELD_COUNT } from "@/lib/services/quality-scoring";
import type { Dossier } from "@prisma/client";

/**
 * Un dossier "complet" avec les 19 champs contrôlés (§53) correctement
 * renseignés — utilisé comme base pour les cas "un seul champ en défaut".
 */
const FULL_DOSSIER: Partial<Dossier> = {
  libelleCarton: "Carton A-12",
  codeBarres: "1234567890",
  numeroGuichet: "G-01",
  numeroDdu: "DDU-01",
  referenceClassement: "REF-01",
  numeroIlot: "I-01",
  numeroLot: "L-01",
  superficie: 450 as unknown as Dossier["superficie"],
  numeroTitreFoncier: "TF-01",
  communeId: 1,
  lotissementId: 1,
  natureDossierId: 1,
  nom: "Kouassi",
  prenoms: "Jean",
  adresse: "Rue 12, Cocody",
  telephone: "0102030405",
  email: "jean.kouassi@example.com",
  personneContact: "Marie Kouassi",
  mobile: "0708091011",
};

describe("scoreDossier (§53)", () => {
  it("attribue 100 à un dossier entièrement et correctement renseigné", () => {
    const result = scoreDossier(FULL_DOSSIER);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.validFields).toBe(QUALITY_FIELD_COUNT);
    expect(result.totalFields).toBe(QUALITY_FIELD_COUNT);
  });

  it("attribue 0 à un dossier entièrement vide", () => {
    const result = scoreDossier({});
    expect(result.score).toBe(0);
    expect(result.validFields).toBe(0);
    expect(result.issues).toHaveLength(QUALITY_FIELD_COUNT);
    expect(result.issues.every((i) => i.type === "CHAMP_MANQUANT")).toBe(true);
  });

  it("compte un champ manquant comme CHAMP_MANQUANT et baisse le score d'exactement 1 champ", () => {
    const { nom, ...rest } = FULL_DOSSIER;
    void nom;
    const result = scoreDossier(rest);
    expect(result.validFields).toBe(QUALITY_FIELD_COUNT - 1);
    expect(result.score).toBe(Math.round(((QUALITY_FIELD_COUNT - 1) / QUALITY_FIELD_COUNT) * 100));
    expect(result.issues).toEqual([
      expect.objectContaining({ champ: "nom", type: "CHAMP_MANQUANT" }),
    ]);
  });

  it("détecte un e-mail mal formé comme FORMAT_INVALIDE (champ rempli mais invalide)", () => {
    const result = scoreDossier({ ...FULL_DOSSIER, email: "pas-un-email" });
    expect(result.validFields).toBe(QUALITY_FIELD_COUNT - 1);
    expect(result.issues).toEqual([
      expect.objectContaining({ champ: "email", type: "FORMAT_INVALIDE", gravite: "MOYENNE" }),
    ]);
  });

  it("détecte un téléphone mal formé comme FORMAT_INVALIDE", () => {
    const result = scoreDossier({ ...FULL_DOSSIER, telephone: "abc" });
    expect(result.issues).toEqual([
      expect.objectContaining({ champ: "telephone", type: "FORMAT_INVALIDE" }),
    ]);
  });

  it("détecte une superficie invalide (<= 0 ou > 1 000 000) comme INCOHERENCE", () => {
    const negative = scoreDossier({ ...FULL_DOSSIER, superficie: -5 as unknown as Dossier["superficie"] });
    expect(negative.issues).toEqual([
      expect.objectContaining({ champ: "superficie", type: "INCOHERENCE" }),
    ]);

    const tooLarge = scoreDossier({ ...FULL_DOSSIER, superficie: 2_000_000 as unknown as Dossier["superficie"] });
    expect(tooLarge.issues).toEqual([
      expect.objectContaining({ champ: "superficie", type: "INCOHERENCE" }),
    ]);
  });

  it("accepte une superficie valide dans les bornes (0, 1 000 000]", () => {
    const result = scoreDossier({ ...FULL_DOSSIER, superficie: 1_000_000 as unknown as Dossier["superficie"] });
    expect(result.score).toBe(100);
  });

  it("ajoute le contrôle document quand includeDocumentCheck est actif", () => {
    const withDoc = scoreDossier(FULL_DOSSIER, { includeDocumentCheck: true, hasDocument: true });
    expect(withDoc.totalFields).toBe(QUALITY_FIELD_COUNT + 1);
    expect(withDoc.validFields).toBe(QUALITY_FIELD_COUNT + 1);
    expect(withDoc.score).toBe(100);

    const withoutDoc = scoreDossier(FULL_DOSSIER, { includeDocumentCheck: true, hasDocument: false });
    expect(withoutDoc.totalFields).toBe(QUALITY_FIELD_COUNT + 1);
    expect(withoutDoc.validFields).toBe(QUALITY_FIELD_COUNT);
    expect(withoutDoc.issues).toEqual([
      expect.objectContaining({ champ: "documents", type: "DOCUMENT_MANQUANT" }),
    ]);
  });

  it("n'ajoute pas le contrôle document quand includeDocumentCheck est absent", () => {
    const result = scoreDossier(FULL_DOSSIER);
    expect(result.totalFields).toBe(QUALITY_FIELD_COUNT);
  });
});
