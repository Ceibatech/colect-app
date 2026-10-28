import { describe, expect, it } from "vitest";
import { normaliserNumero, refusChargement, sensTransport } from "@/lib/caisses/rules";

const caisse = { id: 1, numero: "C-01", capacite: 40, occupes: 10, lotId: null, lotReference: null };
const lot = { lotId: 7, reference: "LOT-2026-000007", statut: "PREVU" };

describe("chargement des cartons dans les caisses de transport", () => {
  it("accepte un carton d'un lot en attente d'enlèvement ou de retour", () => {
    expect(refusChargement({ caisseId: null }, lot, caisse)).toBeNull();
    expect(refusChargement({ caisseId: null }, { ...lot, statut: "RECU" }, { ...caisse, lotId: 7 })).toBeNull();
    expect(sensTransport("PREVU")).toBe("enlèvement");
    expect(sensTransport("RECU")).toBe("retour");
  });
  it("refuse un carton hors lot, déjà dans une autre caisse, d'un autre lot, ou une caisse pleine", () => {
    expect(refusChargement({ caisseId: null }, null, caisse)).toMatch(/aucun lot/);
    expect(refusChargement({ caisseId: 9 }, lot, caisse, "C-09")).toMatch(/C-09/);
    expect(refusChargement({ caisseId: null }, lot, { ...caisse, lotId: 3, lotReference: "LOT-2026-000003" })).toMatch(/LOT-2026-000003.*un lot à la fois/);
    expect(refusChargement({ caisseId: null }, lot, { ...caisse, occupes: 40 })).toMatch(/pleine \(40 cartons\)/);
  });
  it("un carton déjà dans cette caisse n'est pas un refus", () => {
    expect(refusChargement({ caisseId: 1 }, lot, { ...caisse, occupes: 40 })).toBeNull();
  });
  it("normalise le numéro saisi", () => {
    expect(normaliserNumero("  caisse   01 ")).toBe("CAISSE 01");
    expect(normaliserNumero("C-1/A")).toBe("C-1/A");
    expect(normaliserNumero("")).toBeNull();
    expect(normaliserNumero("<script>")).toBeNull();
  });
});
