import { describe, expect, it } from "vitest";
import { parseOsmAndRequest } from "@/lib/transfers/osmand";

describe("positions Traccar Client", () => {
  it("lit le protocole OsmAnd (vitesse en nœuds, horodatage en secondes)", () => {
    const position = parseOsmAndRequest(new URLSearchParams("id=geo-1234abcd&lat=5.4316&lon=-4.0202&timestamp=1761490000&speed=10&bearing=90&accuracy=12"), null)!;
    expect(position).toMatchObject({ deviceId: "geo-1234abcd", latitude: 5.4316, longitude: -4.0202, heading: 90, accuracy: 12 });
    expect(position.speed).toBeCloseTo(5.144, 2);
    expect(position.capturedAt.toISOString()).toBe(new Date(1761490000 * 1000).toISOString());
  });

  it("lit le JSON des versions récentes", () => {
    const position = parseOsmAndRequest(new URLSearchParams(), {
      device_id: "geo-1234abcd",
      location: { timestamp: "2026-10-26T16:00:00Z", coords: { latitude: 5.32, longitude: -4.01, accuracy: 8, speed: 12, heading: 180 } },
    })!;
    expect(position).toMatchObject({ deviceId: "geo-1234abcd", latitude: 5.32, longitude: -4.01, speed: 12, accuracy: 8 });
  });

  it("refuse les positions invalides ou sans identifiant correct", () => {
    expect(parseOsmAndRequest(new URLSearchParams("id=geo-1234abcd&lat=0&lon=0"), null)).toBeNull();
    expect(parseOsmAndRequest(new URLSearchParams("id=x&lat=5&lon=-4"), null)).toBeNull();
    expect(parseOsmAndRequest(new URLSearchParams("id=geo-1234abcd&lat=95&lon=-4"), null)).toBeNull();
    expect(parseOsmAndRequest(new URLSearchParams("id=geo-1234abcd&lat=5&lon=-4&valid=false"), null)).toBeNull();
  });
});
