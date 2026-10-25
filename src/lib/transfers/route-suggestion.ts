/**
 * Proposition d'itinéraire pour une opération de transfert. Le calcul (le plus
 * rapide selon le réseau routier, hors trafic) vient d'OpenStreetMap/OSRM côté
 * serveur ; le lien Google Maps, gratuit et sans clé, montre le trajet avec le
 * trafic du moment au départ.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RouteSummary {
  distanceKm: number;
  durationMinutes: number;
  via: string[];
}

export function isValidGeoPoint(point: Partial<GeoPoint> | null | undefined): point is GeoPoint {
  return !!point
    && typeof point.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
    && !(point.latitude === 0 && point.longitude === 0);
}

const coordinate = (point: GeoPoint) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;

/** Lien Google Maps Directions (URL publique, sans clé d'API). */
export function buildGoogleMapsDirectionsUrl(from: GeoPoint, to: GeoPoint): string {
  const params = new URLSearchParams({ api: "1", origin: coordinate(from), destination: coordinate(to), travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${params}`;
}

/** URL OSRM : l'ordre des coordonnées y est longitude,latitude. */
export function buildOsrmRouteUrl(from: GeoPoint, to: GeoPoint, base = "https://router.project-osrm.org"): string {
  const path = `${from.longitude.toFixed(6)},${from.latitude.toFixed(6)};${to.longitude.toFixed(6)},${to.latitude.toFixed(6)}`;
  return `${base}/route/v1/driving/${path}?overview=false&steps=true`;
}

type OsrmStep = { name?: unknown; ref?: unknown; distance?: unknown };
type OsrmResponse = {
  code?: unknown;
  routes?: Array<{ distance?: unknown; duration?: unknown; legs?: Array<{ summary?: unknown; steps?: OsrmStep[] }> }>;
};

/**
 * Résume la réponse OSRM : distance, durée et jusqu'à trois axes principaux,
 * dans l'ordre du trajet (ceux qui portent le plus de kilomètres).
 */
export function summarizeOsrmRoute(payload: unknown): RouteSummary | null {
  const data = payload as OsrmResponse;
  if (!data || data.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) return null;
  const route = data.routes[0];
  if (typeof route.distance !== "number" || typeof route.duration !== "number" || route.distance <= 0) return null;

  const totals = new Map<string, { distance: number; order: number }>();
  let order = 0;
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const name = typeof step.name === "string" && step.name.trim() ? step.name.trim()
        : typeof step.ref === "string" && step.ref.trim() ? step.ref.trim() : "";
      if (!name || typeof step.distance !== "number") continue;
      const current = totals.get(name) ?? { distance: 0, order: order++ };
      current.distance += step.distance;
      totals.set(name, current);
    }
  }
  let via = [...totals.entries()]
    .filter(([, value]) => value.distance >= 300)
    .sort((a, b) => b[1].distance - a[1].distance)
    .slice(0, 3)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name]) => name);
  if (via.length === 0) {
    const summary = route.legs?.[0]?.summary;
    via = typeof summary === "string" ? summary.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 3) : [];
  }

  return {
    distanceKm: Math.round(route.distance / 100) / 10,
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    via,
  };
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/** Texte proposé dans « Itinéraire prévu », modifiable par l'utilisateur. */
export function formatRouteText(originLabel: string, destinationLabel: string, summary: RouteSummary): string {
  const distance = summary.distanceKm.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const parts = [`${originLabel} → ${destinationLabel}`, `${distance} km`, `environ ${formatDuration(summary.durationMinutes)} hors trafic`];
  if (summary.via.length) parts.push(`via ${summary.via.join(", ")}`);
  return parts.join(" · ");
}
