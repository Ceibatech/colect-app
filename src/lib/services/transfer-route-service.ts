"use server";

import { requirePermission } from "@/lib/auth/current-user";
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
  error?: string;
}

/**
 * Calcule côté serveur l'itinéraire routier le plus rapide (OpenStreetMap/OSRM,
 * hors trafic). Le navigateur ne peut pas appeler ce service (CSP connect-src
 * 'self'). Best effort : en cas d'échec, le lien Google Maps reste proposé et
 * l'itinéraire se saisit à la main — jamais bloquant pour la création du lot.
 */
export async function suggestTransferRoute(from: GeoPoint, to: GeoPoint): Promise<TransferRouteResult> {
  await requirePermission("TRANSFER_CREATE");
  if (!isValidGeoPoint(from) || !isValidGeoPoint(to)) {
    return { error: "Position GPS manquante ou invalide pour le départ ou la destination." };
  }
  const googleMapsUrl = buildGoogleMapsDirectionsUrl(from, to);
  try {
    const response = await fetch(buildOsrmRouteUrl(from, to), {
      headers: { "User-Agent": "GeoArchives/1.0 (contact: CEIBA Analytics)", Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) return { googleMapsUrl, error: "Service d'itinéraire indisponible. Ouvrez Google Maps pour le trajet." };
    const summary = summarizeOsrmRoute(await response.json());
    if (!summary) return { googleMapsUrl, error: "Aucun trajet routier trouvé entre ces deux positions." };
    return { summary, googleMapsUrl };
  } catch {
    return { googleMapsUrl, error: "Impossible de contacter le service d'itinéraire. Ouvrez Google Maps pour le trajet." };
  }
}
