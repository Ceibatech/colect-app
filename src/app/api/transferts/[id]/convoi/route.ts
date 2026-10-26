import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/current-user";
import { assertConvoyActor, recordConvoyEvent } from "@/lib/services/convoy-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const schema = z.object({
  action: z.enum(["depart", "arrivee"]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/** Le convoyeur déclare le départ (début du trajet) ou l'arrivée du véhicule. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiPermission("TRANSFER_TRACK");
    const lotId = Number((await params).id);
    if (!Number.isInteger(lotId) || lotId <= 0) throw new ApiError("Lot invalide.", 400);
    const input = schema.parse(await request.json());
    await assertConvoyActor(session, lotId);
    const position = input.latitude != null && input.longitude != null ? { latitude: input.latitude, longitude: input.longitude } : null;
    const result = await recordConvoyEvent(session, lotId, input.action === "depart" ? "DEPART" : "ARRIVEE", position);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
