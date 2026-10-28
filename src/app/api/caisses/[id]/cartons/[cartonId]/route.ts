import { NextResponse } from "next/server";
import { retirerCarton } from "@/lib/services/caisse-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

/** Retirer un carton de la caisse (l'historique le garde). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; cartonId: string }> }) {
  try {
    const { id, cartonId } = await params;
    const caisseId = Number(id);
    const carton = Number(cartonId);
    if (!Number.isInteger(caisseId) || caisseId <= 0 || !Number.isInteger(carton) || carton <= 0) throw new ApiError("Paramètres invalides.", 400);
    return NextResponse.json(await retirerCarton(caisseId, carton));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
