import { describe, expect, it } from "vitest";
import { convoyState, distanceMeters, isAtDestination, samplePath, staticTrackMapUrl } from "@/lib/transfers/convoy";

const abobo = { latitude: 5.4316, longitude: -4.0202 };

describe("suivi de convoi", () => {
  it("mesure les distances en mètres", () => {
    expect(distanceMeters(abobo, abobo)).toBe(0);
    const d = distanceMeters(abobo, { latitude: 5.4326, longitude: -4.0202 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it("détecte l'arrivée à moins de 150 m, si le GPS est assez précis", () => {
    expect(isAtDestination({ latitude: 5.4320, longitude: -4.0202, accuracy: 20 }, abobo)).toBe(true);
    expect(isAtDestination({ latitude: 5.4400, longitude: -4.0202, accuracy: 20 }, abobo)).toBe(false);
    expect(isAtDestination({ latitude: 5.4317, longitude: -4.0202, accuracy: 500 }, abobo)).toBe(false);
    expect(isAtDestination({ latitude: 5.4317, longitude: -4.0202 }, null)).toBe(false);
  });

  it("suit l'état du dernier trajet", () => {
    expect(convoyState([])).toMatchObject({ onTheRoad: false, arrived: false });
    const depart = { type: "DEPART" as const, occurredAt: "2026-10-26T10:00:00Z" };
    expect(convoyState([depart])).toMatchObject({ onTheRoad: true, arrived: false });
    const arrival = { type: "ARRIVEE" as const, occurredAt: "2026-10-26T10:40:00Z", automatic: true };
    expect(convoyState([arrival, depart])).toMatchObject({ onTheRoad: false, arrived: true, arrivalAutomatic: true });
  });

  it("allège le tracé en gardant le départ et la dernière position", () => {
    const points = Array.from({ length: 500 }, (_, i) => i);
    const sampled = samplePath(points, 60);
    expect(sampled).toHaveLength(60);
    expect(sampled[0]).toBe(0);
    expect(sampled.at(-1)).toBe(499);
  });

  it("construit la carte du trajet seulement avec une clé", () => {
    expect(staticTrackMapUrl(null, [abobo], abobo)).toBeNull();
    const url = new URL(staticTrackMapUrl("KEY", [{ latitude: 5.32, longitude: -4.02 }, abobo], abobo)!);
    expect(url.hostname).toBe("maps.googleapis.com");
    expect(url.searchParams.get("key")).toBe("KEY");
    expect(url.searchParams.getAll("markers")).toHaveLength(3);
    expect(url.searchParams.get("path")).toContain("5.32000,-4.02000|5.43160,-4.02020");
  });
});

import { osmTrackLayout } from "@/lib/transfers/convoy";

describe("carte OpenStreetMap du trajet", () => {
  it("cadre le trajet et la destination dans la carte", () => {
    const layout = osmTrackLayout([{ latitude: 5.32, longitude: -4.02 }, { latitude: 5.38, longitude: -4.03 }], abobo)!;
    expect(layout.tiles.length).toBeGreaterThan(0);
    for (const p of [...layout.path, layout.destination!]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(layout.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(layout.height);
    }
    expect(osmTrackLayout([], null)).toBeNull();
  });
});

import { hasLeft, minutesBetween, nextSiteStep, refusEtape, type ConvoyEvent } from "@/lib/transfers/convoy";

describe("étapes du convoi : chargement, mouvement, déchargement", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 2, 8, minute));
  const ev = (type: ConvoyEvent["type"], minute: number, details?: unknown): ConvoyEvent => ({ type, occurredAt: at(minute), details });

  it("suit le cycle complet et mesure chaque phase", () => {
    const events = [
      ev("CHARGEMENT_DEBUT", 0), ev("CHARGEMENT_FIN", 25), ev("DEPART", 30),
      ev("EN_ROUTE", 34, { etaAt: at(59).toISOString() }), ev("ARRIVEE", 58), ev("DECHARGEMENT_DEBUT", 60), ev("DECHARGEMENT_FIN", 80),
    ];
    const state = convoyState(events);
    expect(state.arrived).toBe(true);
    expect(minutesBetween(state.loadingStartedAt, state.loadingEndedAt)).toBe(25);
    expect(minutesBetween(state.movingAt, state.arrivedAt)).toBe(24);
    expect(minutesBetween(state.unloadingStartedAt, state.unloadingEndedAt)).toBe(20);
    expect(state.etaAt?.toISOString()).toBe(at(59).toISOString());
  });

  it("refuse les étapes dans le désordre", () => {
    expect(refusEtape([], "CHARGEMENT_FIN")).toMatch(/début du chargement/);
    expect(refusEtape([ev("CHARGEMENT_DEBUT", 0)], "DEPART")).toMatch(/chargement n'est pas terminé/);
    expect(refusEtape([ev("CHARGEMENT_DEBUT", 0), ev("CHARGEMENT_FIN", 5)], "DEPART")).toBeNull();
    expect(refusEtape([], "EN_ROUTE")).toMatch(/départ n'est pas déclaré/);
    expect(refusEtape([ev("DEPART", 0)], "DECHARGEMENT_DEBUT")).toMatch(/pas encore arrivé/);
    expect(refusEtape([ev("DEPART", 0), ev("EN_ROUTE", 2)], "EN_ROUTE")).toMatch(/déjà signalé/);
  });

  it("propose au site la prochaine étape à horodater", () => {
    expect(nextSiteStep("source", convoyState([]))).toBe("chargement-debut");
    expect(nextSiteStep("source", convoyState([ev("CHARGEMENT_DEBUT", 0)]))).toBe("chargement-fin");
    expect(nextSiteStep("source", convoyState([ev("CHARGEMENT_DEBUT", 0), ev("CHARGEMENT_FIN", 5), ev("DEPART", 6)]))).toBeNull();
    expect(nextSiteStep("destination", convoyState([ev("DEPART", 0), ev("ARRIVEE", 20)]))).toBe("dechargement-debut");
    expect(nextSiteStep("destination", convoyState([ev("DEPART", 0), ev("ARRIVEE", 20), ev("DECHARGEMENT_DEBUT", 21)]))).toBe("dechargement-fin");
  });

  it("un nouveau chargement après une arrivée ouvre un nouveau cycle", () => {
    const state = convoyState([ev("CHARGEMENT_DEBUT", 0), ev("CHARGEMENT_FIN", 5), ev("DEPART", 6), ev("ARRIVEE", 30), ev("CHARGEMENT_DEBUT", 40)]);
    expect(state.loadingStartedAt?.toISOString()).toBe(at(40).toISOString());
    expect(state.loadingEndedAt).toBeNull();
  });

  it("le véhicule roule quand il s'éloigne de plus de 300 m avec une précision suffisante", () => {
    const start = { latitude: 5.3200, longitude: -4.0200 };
    expect(hasLeft({ latitude: 5.3210, longitude: -4.0200 }, start)).toBe(false);
    expect(hasLeft({ latitude: 5.3240, longitude: -4.0200 }, start)).toBe(true);
    expect(hasLeft({ latitude: 5.3240, longitude: -4.0200, accuracy: 500 }, start)).toBe(false);
  });
});
