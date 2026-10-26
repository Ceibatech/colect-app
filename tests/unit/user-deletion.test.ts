import { describe, expect, it } from "vitest";
import { isDeletionConfirmed, userDeletionBlockers } from "@/lib/utils/user-deletion";

describe("userDeletionBlockers", () => {
  it("ne signale rien pour un compte sans trace métier", () => {
    expect(userDeletionBlockers({})).toEqual([]);
    expect(userDeletionBlockers({ dossierHistory: 0, imports: 0 })).toEqual([]);
  });

  it("liste uniquement les traces présentes avec leur compteur", () => {
    expect(userDeletionBlockers({ dossierHistory: 12, exports: 0, transferLotsCreated: 1 })).toEqual([
      "12 historique de dossiers",
      "1 lots de transfert créés",
    ]);
  });
});

describe("isDeletionConfirmed", () => {
  it("accepte l'e-mail retapé sans tenir compte de la casse ni des espaces autour", () => {
    expect(isDeletionConfirmed("  Test@Ceiba.com ", "test@ceiba.com")).toBe(true);
  });

  it("refuse un e-mail différent ou vide", () => {
    expect(isDeletionConfirmed("autre@ceiba.com", "test@ceiba.com")).toBe(false);
    expect(isDeletionConfirmed("", "test@ceiba.com")).toBe(false);
  });
});
