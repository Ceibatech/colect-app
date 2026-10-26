"use server";

import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import {
  buildGoogleMapsDirectionsUrl,
  buildOsrmRouteUrl,
  isValidGeoPoint,
  summarizeOsrmRoute,
  type GeoPoint,
  type RouteSummary,
} from "@/lib/transfers/route-suggestion";

export interface TransferRouteResult {
  summary?: RouteSummary;
  googleMapsUrl?: string;
  /** Position retenue pour chaque extrémité, et d'où elle vient. */
  from?: GeoPoint & { source: "position" | "gps" | "adresse" };
  to?: GeoPoint & { source: "gps" | "adresse" };
  error?: string;
}

const USER_AGENT = "GeoArchives/1.0 (contact: CEIBA Analytics)";

/**
 * Position d'un site : ses coordonnées GPS si elles sont saisies, sinon son
 * adresse géocodée (OpenStreetMap/Nominatim, Côte d'Ivoire), par exemple
 * « Abobo, Abidjan ». Best effort : null si rien n'est trouvé.
 */
async function resolveSitePoint(siteId: number): Promise<(GeoPoint & { source: "gps" | "adresse" }) | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { nom: true, adresse: true, ville: true, adresseGps: true, latitude: true, longitude: true, commune: { select: { nom: true } } },
  });
  if (!site) return null;
  const gps = { latitude: site.latitude ?? Number.NaN, longitude: site.longitude ?? Number.NaN };
  if (isValidGeoPoint(gps)) return { ...gps, source: "gps" };

  const queries = [
    [site.adresseGps],
    [site.adresse, site.commune?.nom, site.ville],
    [site.commune?.nom, site.ville],
    [site.nom.replace(/^site\s+(minist[eè]re|ceiba)\s*[-–·]?\s*/i, ""), site.ville ?? "Abidjan"],
  ].map((parts) => parts.filter((part): part is string => !!part?.trim()).join(", "))
    .filter((query, index, all) => query.length >= 3 && all.indexOf(query) === index);

  for (const query of queries) {
    try {
      const params = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "ci", q: query });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(6_000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      const [hit] = (await response.json()) as Array<{ lat?: string; lon?: string }>;
      const point = { latitude: Number(hit?.lat), longitude: Number(hit?.lon) };
      if (isValidGeoPoint(point)) return { ...point, source: "adresse" };
    } catch {
      // Essayer la formulation suivante.
    }
  }
  return null;
}

/**
 * Calcule côté serveur l'itinéraire routier le plus rapide (OpenStreetMap/OSRM,
 * hors trafic) entre le départ (position de l'appareil, ou site d'origine) et
 * le site de destination. Le navigateur ne peut pas appeler ces services
 * (CSP connect-src 'self'). Best effort : en cas d'échec, le lien Google Maps
 * reste proposé si les deux positions sont connues, et l'itinéraire se saisit
 * à la main — jamais bloquant pour la création du lot.
 */
export async function suggestTransferRoute(input: {
  fromSiteId?: number | null;
  fromPosition?: GeoPoint | null;
  toSiteId: number;
}): Promise<TransferRouteResult> {
  await requirePermission("TRANSFER_CREATE");
  const [from, to] = await Promise.all([
    input.fromPosition && isValidGeoPoint(input.fromPosition)
      ? Promise.resolve({ latitude: input.fromPosition.latitude, longitude: input.fromPosition.longitude, source: "position" as const })
      : input.fromSiteId ? resolveSitePoint(input.fromSiteId) : Promise.resolve(null),
    Number.isInteger(input.toSiteId) && input.toSiteId > 0 ? resolveSitePoint(input.toSiteId) : Promise.resolve(null),
  ]);
  if (!to) return { error: "Position du site de destination introuvable. Renseignez sa position GPS ou son adresse dans Administration → Sites." };
  if (!from) return { to, error: "Position de départ introuvable : utilisez « Partir de ma position » ou renseignez la position du site d'origine." };

  const googleMapsUrl = buildGoogleMapsDirectionsUrl(from, to);
  try {
    const response = await fetch(buildOsrmRouteUrl(from, to), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return { from, to, googleMapsUrl, error: "Service d'itinéraire indisponible. Ouvrez Google Maps pour le trajet." };
    const summary = summarizeOsrmRoute(await response.json());
    if (!summary) return { from, to, googleMapsUrl, error: "Aucun trajet routier trouvé entre ces deux positions." };
    return { summary, from, to, googleMapsUrl };
  } catch {
    return { from, to, googleMapsUrl, error: "Impossible de contacter le service d'itinéraire. Ouvrez Google Maps pour le trajet." };
  }
}
