import { describe, expect, it } from "vitest";
import { designerIntervenants, type CandidateUser } from "@/lib/transfers/participants";

const site = (id: number, organisation: string) => ({ site: { id, nom: `Site ${id}`, organisation } });
const users: CandidateUser[] = [
  { id: 1, name: "Gestionnaire A", role: { code: "GESTIONNAIRE_TRANSFERT" } },
  { id: 2, name: "Gestionnaire B", role: { code: "GESTIONNAIRE_TRANSFERT" } },
  { id: 3, name: "Valideur interne", role: { code: "VALIDATEUR_CEIBAC" } },
  { id: 4, name: "Convoyeur", role: { code: "CONVOYEUR" } },
  { id: 5, name: "Resp. CEIBA", role: { code: "RESPONSABLE_SITE" }, responsibleSites: [site(10, "CEIBA")] },
  { id: 6, name: "Resp. Plateau", role: { code: "RESPONSABLE_SITE" }, responsibleSites: [site(20, "MINISTERE")] },
  { id: 7, name: "Resp. autre site", role: { code: "RESPONSABLE_SITE" }, responsibleSites: [site(21, "MINISTERE")] },
  { id: 8, name: "Valideur SDA", role: { code: "VALIDATEUR_MINISTERE" } },
];
const ids = (list: CandidateUser[]) => list.map((user) => user.id);

describe("intervenants désignés d'après les responsabilités", () => {
  it("retient le gestionnaire qui crée, les valideurs, le convoyeur et les responsables des deux sites", () => {
    const result = designerIntervenants(users, { creatorId: 1, ceibaSiteId: 10, ministrySiteId: 20 });
    expect(ids(result.ceiba)).toEqual([1, 3, 4, 5]);
    expect(ids(result.sda)).toEqual([6, 8]);
  });
  it("sans gestionnaire à l'origine (administrateur), tous les gestionnaires sont désignés", () => {
    expect(ids(designerIntervenants(users, { creatorId: 99, ceibaSiteId: 10, ministrySiteId: 21 }).ceiba)).toEqual([1, 2, 3, 4, 5]);
    expect(ids(designerIntervenants(users, { creatorId: 99, ceibaSiteId: 10, ministrySiteId: 21 }).sda)).toEqual([7, 8]);
  });
  it("avant le choix des sites, aucun responsable de site n'est désigné", () => {
    const result = designerIntervenants(users, { creatorId: 1, ceibaSiteId: null, ministrySiteId: null });
    expect(ids(result.ceiba)).toEqual([1, 3, 4]);
    expect(ids(result.sda)).toEqual([8]);
  });
});
