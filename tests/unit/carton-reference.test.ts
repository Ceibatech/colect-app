import { describe, expect, it } from "vitest";
import { formatCartonReference, parseCartonReference } from "@/lib/cartons/reference";

describe("références permanentes des cartons", () => {
  it("affiche une référence courte et non liée à l'emplacement", () => {
    expect(formatCartonReference(42)).toBe("CTN-00000042");
    expect(parseCartonReference(" ctn-00000042 ")).toBe(42);
  });
  it("supporte toute la plage SQL Int sans tronquer les grands identifiants", () => {
    expect(parseCartonReference(formatCartonReference(2_147_483_647))).toBe(2_147_483_647);
  });
  it.each([0, -1, 1.2, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])("refuse un identifiant invalide %s", (id) => {
    expect(() => formatCartonReference(id)).toThrow();
  });
  it.each(["42", "CTN-42", "CTN-00000000", "CTN--00000042", "CTN-000000042", "CTN-2147483648", "CTN-00000042x", "CTN-1e000042"])("ne confond pas un code ancien avec une référence valide : %s", (value) => {
    expect(parseCartonReference(value)).toBeNull();
  });
});
