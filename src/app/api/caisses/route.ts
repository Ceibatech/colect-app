import { NextResponse } from "next/server";
import { caisseSchema } from "@/lib/validation/caisse";
import { createCaisse } from "@/lib/services/caisse-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** Créer un conteneur (numéro donné par l'équipe, rattaché à un site CEIBA). */
export async function POST(request: Request) {
  try {
    return NextResponse.json(await createCaisse(caisseSchema.parse(await request.json())), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
