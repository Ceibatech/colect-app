import { describe, expect, it } from "vitest";
import { disabledModuleFor, isHrefDisabled, parseDisabledModules } from "@/lib/modules/catalog";

const outage = { at: "2026-11-04T08:00:00.000Z", by: "Admin", motif: null };

describe("activation par module", () => {
  it("ne bloque rien quand aucun module n'est hors service", () => {
    expect(disabledModuleFor("/transferts/nouveau", {})).toBeNull();
  });

  it("bloque les pages et les API propres d'un module hors service", () => {
    const disabled = { transferts: outage };
    expect(disabledModuleFor("/transferts", disabled)).toMatchObject({ module: { code: "transferts" }, api: false });
    expect(disabledModuleFor("/transferts/12/etiquette", disabled)?.api).toBe(false);
    expect(disabledModuleFor("/caisses", disabled)?.module.code).toBe("transferts");
    expect(disabledModuleFor("/api/transferts/cartons", disabled)?.api).toBe(true);
    expect(disabledModuleFor("/api/osmand", disabled)?.api).toBe(true);
  });

  it("laisse tourner les autres modules et les API partagées", () => {
    const disabled = { transferts: outage, dossiers: outage, cartons: outage };
    expect(disabledModuleFor("/collecte/nouveau", disabled)).toBeNull();
    expect(disabledModuleFor("/api/dossiers/4/documents", disabled)).toBeNull();
    expect(disabledModuleFor("/api/cartons/choix", disabled)).toBeNull();
    expect(disabledModuleFor("/administration/modules", disabled)).toBeNull();
    expect(disabledModuleFor("/dashboard", disabled)).toBeNull();
    expect(disabledModuleFor("/api/health", disabled)).toBeNull();
  });

  it("ne confond pas un préfixe avec un autre chemin", () => {
    expect(disabledModuleFor("/cartons-archives", { cartons: outage })).toBeNull();
    expect(disabledModuleFor("/c/ABC123", { cartons: outage })?.module.code).toBe("cartons");
    expect(disabledModuleFor("/collecte", { cartons: outage })).toBeNull();
  });

  it("isole la finance du tableau de bord", () => {
    expect(disabledModuleFor("/dashboard/finance", { finance: outage })?.module.code).toBe("finance");
    expect(disabledModuleFor("/dashboard/pmo", { finance: outage })).toBeNull();
    expect(isHrefDisabled("/dashboard", { finance: outage })).toBe(false);
  });

  it("lit le paramètre avec tolérance", () => {
    expect(parseDisabledModules(null)).toEqual({});
    expect(parseDisabledModules("pas du json")).toEqual({});
    expect(parseDisabledModules("[\"transferts\"]")).toEqual({});
    expect(parseDisabledModules(JSON.stringify({ transferts: outage, inconnu: outage }))).toEqual({ transferts: outage });
  });
});
