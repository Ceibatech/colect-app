import { describe, expect, it } from "vitest";
import { abidjanNowInputValue, parseAbidjanDateTime } from "@/lib/utils/abidjan-time";

describe("heures saisies à l'heure d'Abidjan", () => {
  it("lit un champ date et heure comme UTC+0, quel que soit le fuseau", () => {
    expect(parseAbidjanDateTime("2026-10-31T10:00").toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(parseAbidjanDateTime("2026-10-31T10:00:00Z").toISOString()).toBe("2026-10-31T10:00:00.000Z");
  });
  it("propose l'heure d'Abidjan par défaut", () => {
    expect(abidjanNowInputValue(new Date("2026-10-30T05:24:33Z"))).toBe("2026-10-30T05:24");
  });
});
