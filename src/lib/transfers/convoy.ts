/**
 * Règles du suivi de convoi : départ, trajet, arrivée détectée à l'approche
 * du site d'arrivée, et carte du trajet (Google Static Maps).
 */

export type GeoPoint = { latitude: number; longitude: number };
export type ConvoyEvent = { type: "DEPART" | "ARRIVEE"; occurredAt: Date | string; automatic?: boolean };

/** Rayon autour du site d'arrivée dans lequel le véhicule est considéré arrivé. */
export const ARRIVAL_RADIUS_METERS = 150;
/** Au-delà de cette imprécision GPS, on n'annonce pas d'arrivée automatique. */
export const ARRIVAL_MAX_ACCURACY_METERS = 100;

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const radius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isAtDestination(point: GeoPoint & { accuracy?: number | null }, destination: GeoPoint | null): boolean {
  if (!destination) return false;
  if ((point.accuracy ?? 0) > ARRIVAL_MAX_ACCURACY_METERS) return false;
  return distanceMeters(point, destination) <= ARRIVAL_RADIUS_METERS;
}

/** État du dernier trajet : parti, arrivé, ou pas encore parti. */
export function convoyState(events: readonly ConvoyEvent[]) {
  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const last = sorted.at(-1);
  const lastDeparture = [...sorted].reverse().find((event) => event.type === "DEPART") ?? null;
  return {
    onTheRoad: last?.type === "DEPART",
    arrived: last?.type === "ARRIVEE",
    departedAt: lastDeparture ? new Date(lastDeparture.occurredAt) : null,
    arrivedAt: last?.type === "ARRIVEE" ? new Date(last.occurredAt) : null,
    arrivalAutomatic: last?.type === "ARRIVEE" ? !!last.automatic : false,
  };
}

/** Réduit un trajet à `max` points régulièrement espacés (premier et dernier conservés). */
export function samplePath<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]);
}

const coord = (point: GeoPoint) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

/**
 * Carte statique du trajet suivi : tracé bleu, départ en vert, position
 * actuelle en bleu, arrivée en rouge. Null sans clé ni point.
 */
export function staticTrackMapUrl(key: string | null | undefined, points: readonly GeoPoint[], destination: GeoPoint | null, size = "640x360"): string | null {
  if (!key || (points.length === 0 && !destination)) return null;
  const params = new URLSearchParams({ size, scale: "2", maptype: "roadmap", key });
  const path = samplePath(points, 60);
  if (path.length > 1) params.append("path", `color:0x2563ebff|weight:5|${path.map(coord).join("|")}`);
  if (points.length) {
    params.append("markers", `size:small|color:green|label:D|${coord(points[0])}`);
    params.append("markers", `color:blue|${coord(points[points.length - 1])}`);
  }
  if (destination) params.append("markers", `color:red|label:A|${coord(destination)}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

const TILE = 256;

function project(point: GeoPoint, zoom: number) {
  const scale = TILE * 2 ** zoom;
  const lat = Math.max(-85, Math.min(85, point.latitude)) * Math.PI / 180;
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * scale,
  };
}

/**
 * Carte du trajet sans clé : tuiles OpenStreetMap et tracé en surimpression.
 * Retourne les tuiles à afficher et les positions (en pixels) des points
 * dans un cadre `width` × `height`, au zoom le plus fort qui contient tout.
 */
export function osmTrackLayout(points: readonly GeoPoint[], destination: GeoPoint | null, width = 640, height = 360) {
  const all = [...points, ...(destination ? [destination] : [])];
  if (all.length === 0) return null;
  let zoom = 17;
  for (; zoom > 3; zoom--) {
    const projected = all.map((point) => project(point, zoom));
    const spanX = Math.max(...projected.map((p) => p.x)) - Math.min(...projected.map((p) => p.x));
    const spanY = Math.max(...projected.map((p) => p.y)) - Math.min(...projected.map((p) => p.y));
    if (spanX <= width * 0.8 && spanY <= height * 0.8) break;
  }
  const projected = all.map((point) => project(point, zoom));
  const centerX = (Math.max(...projected.map((p) => p.x)) + Math.min(...projected.map((p) => p.x))) / 2;
  const centerY = (Math.max(...projected.map((p) => p.y)) + Math.min(...projected.map((p) => p.y))) / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const tiles: Array<{ url: string; x: number; y: number }> = [];
  const max = 2 ** zoom;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= max) continue;
      const wrapped = ((tx % max) + max) % max;
      tiles.push({ url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
    }
  }
  const toFrame = (point: GeoPoint) => {
    const p = project(point, zoom);
    return { x: p.x - left, y: p.y - top };
  };
  return { zoom, width, height, tiles, path: samplePath(points, 200).map(toFrame), destination: destination ? toFrame(destination) : null };
}
