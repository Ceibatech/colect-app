import { describe, expect, it } from "vitest";
import { canSignMovementAtSite, movementEnds } from "@/lib/transfers/site-scope";
import { participantAllowedOnSide } from "@/lib/transfers/participants";

// Lot Plateau (site ministère 1) → Abobo (site CEIBA 2).
const lot = { sourceSiteId: 1, destinationSiteId: 2 };

describe("périmètre du responsable de site", () => {
  it("réserve la remise des cartons au site de départ", () => {
    expect(canSignMovementAtSite("SORTIE", lot, [1])).toBe(true);
    expect(canSignMovementAtSite("SORTIE", lot, [2])).toBe(false);
  });

  it("réserve l'état des lieux d'arrivée au site d'arrivée", () => {
    expect(canSignMovementAtSite("RECEPTION", lot, [2])).toBe(true);
    expect(canSignMovementAtSite("RECEPTION", lot, [1])).toBe(false);
  });

  it("fait signer la restitution par le site d'où les cartons repartent", () => {
    expect(movementEnds("RETOUR", lot)).toEqual({ fromSiteId: 2, toSiteId: 1 });
    expect(canSignMovementAtSite("RETOUR", lot, [2])).toBe(true);
    expect(canSignMovementAtSite("RETOUR", lot, [1])).toBe(false);
  });

  it("ne restreint pas les profils sans site (gestionnaire, administrateur)", () => {
    expect(canSignMovementAtSite("RECEPTION", lot, null)).toBe(true);
  });

  it("refuse tout mouvement à un responsable sans site", () => {
    expect(canSignMovementAtSite("SORTIE", lot, [])).toBe(false);
  });
});

describe("intervenants proposés par côté", () => {
  const responsable = (organisation: string) => ({ id: 1, name: "R", role: { code: "RESPONSABLE_SITE" }, responsibleSites: [{ site: { nom: "S", organisation } }] });

  it("place un responsable du côté de l'organisation de ses sites", () => {
    expect(participantAllowedOnSide(responsable("MINISTERE"), "SDA")).toBe(true);
    expect(participantAllowedOnSide(responsable("MINISTERE"), "CEIBA")).toBe(false);
    expect(participantAllowedOnSide(responsable("CEIBA"), "CEIBA")).toBe(true);
  });

  it("écarte un responsable sans site", () => {
    expect(participantAllowedOnSide({ id: 2, name: "X", role: { code: "RESPONSABLE_SITE" }, responsibleSites: [] }, "SDA")).toBe(false);
  });

  it("garde les profils propres à chaque côté", () => {
    expect(participantAllowedOnSide({ id: 3, name: "F", role: { code: "VALIDATEUR_MINISTERE" } }, "SDA")).toBe(true);
    expect(participantAllowedOnSide({ id: 4, name: "Y", role: { code: "CONVOYEUR" } }, "CEIBA")).toBe(true);
  });
});
