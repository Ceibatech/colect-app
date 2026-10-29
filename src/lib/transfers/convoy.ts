/**
 * Règles du suivi de convoi : départ, trajet, arrivée détectée à l'approche
 * du site d'arrivée, et carte du trajet (Google Static Maps).
 */

export type GeoPoint = { latitude: number; longitude: number };
/**
 * Étapes d'un convoi, dans l'ordre : chargement au site de départ, fiche de
 * départ, véhicule en mouvement (détecté par GPS), arrivée, déchargement.
 */
export const CONVOY_EVENT_TYPES = ["CHARGEMENT_DEBUT", "CHARGEMENT_FIN", "DEPART", "EN_ROUTE", "ARRIVEE", "DECHARGEMENT_DEBUT", "DECHARGEMENT_FIN"] as const;
export type ConvoyEventType = (typeof CONVOY_EVENT_TYPES)[number];
export type ConvoyEvent = { type: ConvoyEventType; occurredAt: Date | string; automatic?: boolean; details?: unknown };

/** Distance au point de départ au-delà de laquelle le véhicule est considéré en mouvement. */
export const MOVING_RADIUS_METERS = 300;

/** Le véhicule a quitté son point de départ (précision GPS suffisante). */
export function hasLeft(point: GeoPoint & { accuracy?: number | null }, start: GeoPoint | null): boolean {
  if (!start) return false;
  if ((point.accuracy ?? 0) > ARRIVAL_MAX_ACCURACY_METERS) return false;
  return distanceMeters(point, start) > MOVING_RADIUS_METERS;
}

const TRIP_EVENTS = new Set<ConvoyEventType>(["DEPART", "EN_ROUTE", "ARRIVEE"]);

/** Étapes du cycle en cours : un nouveau chargement, ou un départ après une arrivée, ouvre un cycle. */
function currentCycle(sorted: readonly ConvoyEvent[]) {
  let cycle: ConvoyEvent[] = [];
  for (const event of sorted) {
    const tripDone = cycle.some((item) => item.type === "ARRIVEE");
    if ((event.type === "CHARGEMENT_DEBUT" && cycle.length) || (event.type === "DEPART" && tripDone)) cycle = [];
    cycle.push(event);
  }
  return cycle;
}

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

/** État du dernier trajet : chargement, parti, en mouvement, arrivé, déchargement. */
export function convoyState(events: readonly ConvoyEvent[]) {
  const sorted = [...events].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const last = sorted.filter((event) => TRIP_EVENTS.has(event.type)).at(-1);
  const lastDeparture = [...sorted].reverse().find((event) => event.type === "DEPART") ?? null;
  const cycle = currentCycle(sorted);
  const at = (type: ConvoyEventType) => {
    const event = [...cycle].reverse().find((item) => item.type === type);
    return event ? new Date(event.occurredAt) : null;
  };
  const moving = [...cycle].reverse().find((item) => item.type === "EN_ROUTE");
  const etaRaw = (moving?.details as { etaAt?: string } | null | undefined)?.etaAt;
  const onTheRoad = last?.type === "DEPART" || last?.type === "EN_ROUTE";
  const arrived = last?.type === "ARRIVEE";
  return {
    onTheRoad,
    arrived,
    departedAt: lastDeparture ? new Date(lastDeparture.occurredAt) : null,
    arrivedAt: arrived ? new Date(last.occurredAt) : null,
    arrivalAutomatic: arrived ? !!last.automatic : false,
    loadingStartedAt: at("CHARGEMENT_DEBUT"),
    loadingEndedAt: at("CHARGEMENT_FIN"),
    movingAt: onTheRoad || arrived ? at("EN_ROUTE") : null,
    movingAutomatic: !!moving?.automatic,
    etaAt: etaRaw ? new Date(etaRaw) : null,
    unloadingStartedAt: arrived ? at("DECHARGEMENT_DEBUT") : null,
    unloadingEndedAt: arrived ? at("DECHARGEMENT_FIN") : null,
  };
}

export type ConvoyState = ReturnType<typeof convoyState>;

/** Raison pour laquelle l'étape ne peut pas être enregistrée maintenant, ou null. */
export function refusEtape(events: readonly ConvoyEvent[], type: ConvoyEventType): string | null {
  const state = convoyState(events);
  switch (type) {
    case "CHARGEMENT_DEBUT":
      if (state.onTheRoad) return "Le convoi est déjà en route.";
      if (state.loadingStartedAt && !state.arrived) return "Le chargement est déjà commencé.";
      return null;
    case "CHARGEMENT_FIN":
      if (state.onTheRoad) return "Le convoi est déjà en route.";
      if (!state.loadingStartedAt || state.arrived) return "Indiquez d'abord le début du chargement.";
      if (state.loadingEndedAt) return "La fin du chargement est déjà enregistrée.";
      return null;
    case "DEPART":
      if (state.onTheRoad) return "Le départ est déjà déclaré.";
      if (state.loadingStartedAt && !state.loadingEndedAt && !state.arrived) return "Le chargement n'est pas terminé : le responsable du site doit en indiquer la fin.";
      return null;
    case "EN_ROUTE":
      if (!state.onTheRoad) return "Le départ n'est pas déclaré.";
      if (state.movingAt) return "Le véhicule est déjà signalé en route.";
      return null;
    case "ARRIVEE":
      return state.onTheRoad ? null : "Le convoi n'est pas en route.";
    case "DECHARGEMENT_DEBUT":
      if (!state.arrived) return "Le véhicule n'est pas encore arrivé.";
      return state.unloadingStartedAt ? "Le déchargement est déjà commencé." : null;
    case "DECHARGEMENT_FIN":
      if (!state.unloadingStartedAt) return "Indiquez d'abord le début du déchargement.";
      return state.unloadingEndedAt ? "La fin du déchargement est déjà enregistrée." : null;
  }
}

/** Prochaine étape à horodater par le site (départ : chargement ; arrivée : déchargement), ou null. */
export function nextSiteStep(side: "source" | "destination", state: Pick<ConvoyState, "loadingStartedAt" | "loadingEndedAt" | "onTheRoad" | "arrived" | "unloadingStartedAt" | "unloadingEndedAt">) {
  if (side === "source") {
    if (state.onTheRoad) return null;
    if (!state.loadingStartedAt || state.arrived) return "chargement-debut" as const;
    return state.loadingEndedAt ? null : "chargement-fin" as const;
  }
  if (!state.arrived) return null;
  if (!state.unloadingStartedAt) return "dechargement-debut" as const;
  return state.unloadingEndedAt ? null : "dechargement-fin" as const;
}

/** Durée entre deux étapes, en minutes (null si l'une manque). */
export function minutesBetween(start: Date | null, end: Date | null) {
  return start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)) : null;
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
