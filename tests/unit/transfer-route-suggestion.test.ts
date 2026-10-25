import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsDirectionsUrl,
  buildOsrmRouteUrl,
  formatRouteText,
  isValidGeoPoint,
  summarizeOsrmRoute,
} from "@/lib/transfers/route-suggestion";

const plateau = { latitude: 5.3197, longitude: -4.0167 };
const abobo = { latitude: 5.4316, longitude: -4.0204 };

describe("proposition d'itinéraire de transfert", () => {
  it("construit un lien Google Maps sans clé et une requête OSRM en longitude,latitude", () => {
    expect(buildGoogleMapsDirectionsUrl(plateau, abobo))
      .toBe("https://www.google.com/maps/dir/?api=1&origin=5.319700%2C-4.016700&destination=5.431600%2C-4.020400&travelmode=driving");
    expect(buildOsrmRouteUrl(plateau, abobo))
      .toBe("https://router.project-osrm.org/route/v1/driving/-4.016700,5.319700;-4.020400,5.431600?overview=false&steps=true");
  });

  it("refuse une position absente, hors bornes ou nulle", () => {
    expect(isValidGeoPoint(plateau)).toBe(true);
    expect(isValidGeoPoint({ latitude: Number.NaN, longitude: 2 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 95, longitude: 2 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isValidGeoPoint(null)).toBe(false);
  });

  it("résume la réponse OSRM avec les axes principaux dans l'ordre du trajet", () => {
    const summary = summarizeOsrmRoute({
      code: "Ok",
      routes: [{
        distance: 16_840, duration: 2_090,
        legs: [{ summary: "Boulevard Latrille, Autoroute du Nord", steps: [
          { name: "Avenue Chardy", distance: 450 },
          { name: "Boulevard Latrille", distance: 6_200 },
          { name: "", ref: "A1", distance: 7_100 },
          { name: "Rue locale", distance: 120 },
          { name: "Boulevard Latrille", distance: 900 },
          { name: "Voie d'Abobo", distance: 1_900 },
        ] }],
      }],
    });
    expect(summary).toEqual({ distanceKm: 16.8, durationMinutes: 35, via: ["Boulevard Latrille", "A1", "Voie d'Abobo"] });
    expect(formatRouteText("Site ministère - Plateau", "Site CEIBA Abobo", summary!))
      .toBe("Site ministère - Plateau → Site CEIBA Abobo · 16,8 km · environ 35 min hors trafic · via Boulevard Latrille, A1, Voie d'Abobo");
  });

  it("se rabat sur le résumé OSRM et ignore une réponse sans trajet", () => {
    expect(summarizeOsrmRoute({ code: "Ok", routes: [{ distance: 4_000, duration: 4_000, legs: [{ summary: "Rue A, Rue B", steps: [] }] }] }))
      .toEqual({ distanceKm: 4, durationMinutes: 67, via: ["Rue A", "Rue B"] });
    expect(summarizeOsrmRoute({ code: "NoRoute", routes: [] })).toBeNull();
    expect(summarizeOsrmRoute(null)).toBeNull();
    expect(formatRouteText("A", "B", { distanceKm: 4, durationMinutes: 67, via: [] })).toBe("A → B · 4,0 km · environ 1 h 07 hors trafic");
  });
});
