import { describe, expect, it } from "vitest";
import { resolveTransferDirection } from "@/lib/transfers/direction";
import { resolveMultiChoice, resolveSingleChoice, SECURITY_MEASURES, TRANSPORT_METHODS } from "@/lib/transfers/planning-options";

describe("listes de planification des transferts", () => {
  it("fige le libellé d'un choix unique et exige la précision de « Autre »", () => {
    expect(resolveSingleChoice(TRANSPORT_METHODS, "VEHICULE_CEIBA", null)).toBe("Véhicule fermé dédié CEIBA");
    expect(resolveSingleChoice(TRANSPORT_METHODS, "AUTRE", " ")).toBeNull();
    expect(resolveSingleChoice(TRANSPORT_METHODS, "AUTRE", "Moto")).toBe("Autre : Moto");
    expect(resolveSingleChoice(TRANSPORT_METHODS, "INCONNU", null)).toBeNull();
  });

  it("ordonne les choix multiples comme la liste, sans doublon, et rejette une valeur inconnue", () => {
    expect(resolveMultiChoice(SECURITY_MEASURES, ["SUIVI_GPS", "SCELLES", "SCELLES"], null))
      .toEqual(["Cartons fermés et scellés numérotés", "Suivi GPS du convoi en temps réel"]);
    expect(resolveMultiChoice(SECURITY_MEASURES, ["SCELLES", "AUTRE"], "Double cadenas"))
      .toEqual(["Cartons fermés et scellés numérotés", "Autre : Double cadenas"]);
    expect(resolveMultiChoice(SECURITY_MEASURES, ["AUTRE"], "")).toBeNull();
    expect(resolveMultiChoice(SECURITY_MEASURES, ["PIRATE"], null)).toBeNull();
  });

  it("reconnaît les deux sens du circuit et rien d'autre", () => {
    expect(resolveTransferDirection("MINISTERE", "CEIBA")).toBe("PRISE_EN_CHARGE");
    expect(resolveTransferDirection("CEIBA", "MINISTERE")).toBe("RESTITUTION");
    expect(resolveTransferDirection("CEIBA", "CEIBA")).toBeNull();
    expect(resolveTransferDirection("AUTRE", "CEIBA")).toBeNull();
  });
});
