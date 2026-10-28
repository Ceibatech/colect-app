import { describe, expect, it } from "vitest";
import { activiteDAction, activiteDePage, formatDuree } from "@/lib/activite/categories";

describe("temps de travail", () => {
  it("rattache chaque page à son activité", () => {
    expect(activiteDePage("/collecte")).toBe("INVENTAIRE");
    expect(activiteDePage("/conditionnement")).toBe("RECONDITIONNEMENT");
    expect(activiteDePage("/caisses/3")).toBe("TRANSFERTS");
    expect(activiteDePage("/dossiers/12", "indexation")).toBe("INDEXATION");
    expect(activiteDePage("/dossiers/12")).toBe("CONSULTATION");
    expect(activiteDePage("/dashboard")).toBe("AUTRES");
  });
  it("rattache chaque action enregistrée à son activité", () => {
    expect(activiteDAction("SOUMISSION")).toBe("INVENTAIRE");
    expect(activiteDAction("VALIDATION")).toBe("VALIDATION");
    expect(activiteDAction("PREPARATION_VALIDATION")).toBe("PREPARATION");
    expect(activiteDAction("CONDITIONNEMENT_DOSSIER_TERMINE")).toBe("RECONDITIONNEMENT");
    expect(activiteDAction("TRANSFER_SORTIE")).toBe("TRANSFERTS");
  });
  it("affiche les durées lisiblement", () => {
    expect(formatDuree(45)).toBe("45 min");
    expect(formatDuree(125)).toBe("2 h 05");
  });
});
