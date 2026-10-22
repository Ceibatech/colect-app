import { describe, expect, it } from "vitest";
import {
  canonicalizeTypePieceLabel,
  getTypePieceMatchKey,
  getTypePieceSuggestionScore,
  normalizeTypePieceText,
} from "@/lib/utils/type-piece-normalization";

describe("type-piece normalization", () => {
  it("maps CNI variants to one professional label", () => {
    expect(canonicalizeTypePieceLabel("CNI")).toBe("Carte nationale d'identité");
    expect(canonicalizeTypePieceLabel("carte nationale identite")).toBe(
      "Carte nationale d'identité",
    );
    expect(getTypePieceMatchKey("CNI")).toBe(
      getTypePieceMatchKey("Carte nationale d’identité"),
    );
  });

  it("harmonizes common document abbreviations", () => {
    expect(canonicalizeTypePieceLabel("carte résident")).toBe("Carte de résident");
    expect(canonicalizeTypePieceLabel("Extrait topo")).toBe("Extrait topographique");
    expect(canonicalizeTypePieceLabel("PV")).toBe("Procès-verbal");
    expect(canonicalizeTypePieceLabel("ACP")).toBe("Arrêté de concession provisoire");
  });

  it("keeps an unknown document while cleaning its spacing", () => {
    expect(canonicalizeTypePieceLabel("  certificat   de mariage ")).toBe(
      "Certificat de mariage",
    );
  });

  it("ignores accents, punctuation and casing in comparisons", () => {
    expect(normalizeTypePieceText("  Procès-verbal  ")).toBe("proces verbal");
    expect(getTypePieceMatchKey("Acte naissance")).toBe(
      getTypePieceMatchKey("Acte de naissance"),
    );
  });

  it("finds a canonical option from an abbreviation or partial text", () => {
    expect(getTypePieceSuggestionScore("CNI", "Carte nationale d'identité")).toBe(100);
    expect(getTypePieceSuggestionScore("consul", "Carte consulaire")).toBeGreaterThan(0);
    expect(getTypePieceSuggestionScore("passeport", "Carte consulaire")).toBe(0);
  });
});
