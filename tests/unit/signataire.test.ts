import { describe, expect, it } from "vitest";
import { signataireDe } from "@/lib/transfers/signataire";

describe("identité du signataire reprise du compte", () => {
  it("imprime le nom harmonisé et la fonction renseignée", () => {
    expect(signataireDe({ name: "kouassi  awa", fonction: " Chef du service des archives ", roleCode: "VALIDATEUR_MINISTERE" }))
      .toEqual({ name: "KOUASSI AWA", title: "Chef du service des archives" });
  });
  it("sans fonction, le rôle tient lieu de fonction", () => {
    expect(signataireDe({ name: "Awa", fonction: null, roleCode: "RESPONSABLE_SITE" }).title).toBe("Responsable de site");
  });
});
