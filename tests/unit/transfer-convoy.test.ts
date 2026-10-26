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
