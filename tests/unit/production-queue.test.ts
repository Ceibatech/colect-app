import { describe, expect, it } from "vitest";
import { parseProductionQueueSearch } from "@/lib/validation/production-queue";

describe("production queue filters", () => {
  it("applique les valeurs par défaut", () => {
    expect(parseProductionQueueSearch({})).toEqual({ statut: "A_TRAITER", page: 1 });
  });

  it("normalise les valeurs reçues depuis les paramètres URL", () => {
    expect(parseProductionQueueSearch({
      q: "  carton A  ",
      carton: ["site:2|code:A-1", "ignored"],
      statut: "TERMINE",
      page: "3",
    })).toEqual({ q: "carton A", carton: "site:2|code:A-1", statut: "TERMINE", page: 3 });
  });

  it("revient aux filtres sûrs lorsque la requête est invalide", () => {
    expect(parseProductionQueueSearch({ statut: "SUPPRIME", page: "0" })).toEqual({ statut: "A_TRAITER", page: 1 });
  });
});
