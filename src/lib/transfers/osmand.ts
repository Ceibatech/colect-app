/**
 * Lecture des positions envoyées par l'application Traccar Client (gratuite,
 * Android et iOS), qui suit le téléphone même écran éteint. Deux formats :
 * - protocole OsmAnd (paramètres d'URL ou de formulaire) :
 *   ?id=…&lat=…&lon=…&timestamp=…&speed=… (vitesse en nœuds) ;
 * - JSON des versions récentes : { device_id, location: { timestamp,
 *   coords: { latitude, longitude, accuracy, speed (m/s), heading } } }.
 */

export type OsmAndPosition = {
  deviceId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt: Date;
};

const KNOTS_TO_MPS = 0.514444;

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function time(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber);
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function valid(position: Omit<OsmAndPosition, "deviceId"> & { deviceId?: string }): OsmAndPosition | null {
  if (!position.deviceId || !/^[A-Za-z0-9_-]{8,64}$/.test(position.deviceId)) return null;
  if (position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) return null;
  if (position.latitude === 0 && position.longitude === 0) return null;
  return {
    deviceId: position.deviceId,
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy !== undefined && position.accuracy >= 0 && position.accuracy <= 100_000 ? position.accuracy : undefined,
    speed: position.speed !== undefined && position.speed >= 0 && position.speed <= 200 ? position.speed : undefined,
    heading: position.heading !== undefined && position.heading >= 0 && position.heading <= 360 ? position.heading : undefined,
    capturedAt: position.capturedAt,
  };
}

export function parseOsmAndRequest(params: URLSearchParams, body: unknown): OsmAndPosition | null {
  if (body && typeof body === "object" && "location" in body) {
    const json = body as { device_id?: unknown; location?: { timestamp?: unknown; coords?: Record<string, unknown> } };
    const coords = json.location?.coords ?? {};
    const latitude = num(coords.latitude);
    const longitude = num(coords.longitude);
    if (latitude === undefined || longitude === undefined) return null;
    return valid({
      deviceId: typeof json.device_id === "string" ? json.device_id : undefined,
      latitude,
      longitude,
      accuracy: num(coords.accuracy),
      speed: num(coords.speed),
      heading: num(coords.heading),
      capturedAt: time(json.location?.timestamp),
    });
  }
  const get = (...names: string[]) => names.map((name) => params.get(name)).find((value) => value !== null) ?? undefined;
  let latitude = num(get("lat"));
  let longitude = num(get("lon"));
  const location = get("location");
  if ((latitude === undefined || longitude === undefined) && location) {
    const [lat, lon] = location.split(",");
    latitude = num(lat);
    longitude = num(lon);
  }
  if (latitude === undefined || longitude === undefined) return null;
  if (["false", "0"].includes(get("valid") ?? "")) return null;
  const knots = num(get("speed"));
  return valid({
    deviceId: get("id", "deviceid"),
    latitude,
    longitude,
    accuracy: num(get("accuracy")),
    speed: knots === undefined ? undefined : knots * KNOTS_TO_MPS,
    heading: num(get("bearing", "heading")),
    capturedAt: time(get("timestamp")),
  });
}
