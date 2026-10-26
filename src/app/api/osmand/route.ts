import { NextResponse, type NextRequest } from "next/server";
import { recordTrackerPosition } from "@/lib/services/convoy-service";
import { parseOsmAndRequest } from "@/lib/transfers/osmand";

/**
 * Réception des positions de l'application Traccar Client (protocole OsmAnd).
 * Pas de session : le téléphone s'identifie par l'identifiant secret affiché
 * au convoyeur dans « Mes convois ». Sans convoi en route, le point est
 * ignoré (réponse 200 pour que l'application ne le renvoie pas en boucle).
 */
async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  let body: unknown = null;
  if (request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    const text = (await request.text()).slice(0, 20_000);
    if (type.includes("json") || text.trimStart().startsWith("{")) {
      try { body = JSON.parse(text); } catch { body = null; }
    } else {
      for (const [key, value] of new URLSearchParams(text)) params.set(key, value);
    }
  }
  const position = parseOsmAndRequest(params, body);
  if (!position) return new NextResponse("Position invalide", { status: 400 });
  try {
    const result = await recordTrackerPosition(position);
    if (result.status === "unknown-device") return new NextResponse("Identifiant inconnu", { status: 403 });
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("OsmAnd position failed.", error);
    return new NextResponse("Erreur", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
