import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/current-user";
import { assertConvoyActor, declareMoving, recordConvoyEvent, startConvoy } from "@/lib/services/convoy-service";
import { convoyDepartureSchema } from "@/lib/validation/transfer";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const schema = z.object({
  action: z.enum(["depart", "en-route", "arrivee"]),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  departure: convoyDepartureSchema.optional(),
  /** Heure saisie à la main quand le GPS ne suit pas le trajet. */
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Le convoyeur déclare le départ (fiche), le véhicule en route (si le GPS ne
 * l'a pas détecté) ou l'arrivée du véhicule.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiPermission("TRANSFER_TRACK");
    const lotId = Number((await params).id);
    if (!Number.isInteger(lotId) || lotId <= 0) throw new ApiError("Lot invalide.", 400);
    const input = schema.parse(await request.json());
    await assertConvoyActor(session, lotId);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : undefined;
    const position = input.latitude != null && input.longitude != null ? { latitude: input.latitude, longitude: input.longitude } : null;
    if (input.action === "depart" && !input.departure) throw new ApiError("Remplissez la fiche de départ avant de démarrer le trajet.", 400);
    const result = input.action === "depart"
      ? await startConvoy(session, lotId, input.departure!, position)
      : input.action === "en-route"
        ? await declareMoving(session, lotId, position, false, occurredAt)
        : await recordConvoyEvent(session, lotId, "ARRIVEE", position, false, undefined, occurredAt);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
