import { NextResponse } from "next/server";
import { caisseSchema } from "@/lib/validation/caisse";
import { updateCaisse } from "@/lib/services/caisse-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

/** Modifier ou renuméroter une caisse : son contenu reste attaché. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Caisse invalide.", 400);
    return NextResponse.json(await updateCaisse(id, caisseSchema.parse(await request.json())));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
