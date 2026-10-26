import { NextResponse } from "next/server";
import { z } from "zod";
import { finishReconditionnement, releaseReconditionnement, startReconditionnement } from "@/lib/services/reconditionnement-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("release") }),
  z.object({
    action: z.literal("finish"),
    etat: z.enum(["ETAT_INITIAL", "AVEC_RESERVE"]),
    observations: z.string().trim().max(2_000).optional(),
  }),
]);

/** Reconditionnement d'un dossier : commencer, terminer (avec la réponse de fin) ou libérer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Dossier invalide.", 400);
    const input = schema.parse(await request.json());
    if (input.action === "start") return NextResponse.json(await startReconditionnement(id));
    if (input.action === "release") return NextResponse.json(await releaseReconditionnement(id));
    return NextResponse.json(await finishReconditionnement(id, input.etat, input.observations));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
