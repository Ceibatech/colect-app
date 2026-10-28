import { NextResponse } from "next/server";
import { z } from "zod";
import { chargerCarton } from "@/lib/services/caisse-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

/** Charger un carton du lot (cote saisie, QR ou douchette) dans la caisse de transport. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError("Caisse invalide.", 400);
    const { scan } = z.object({ scan: z.string().trim().min(2).max(300) }).parse(await request.json());
    return NextResponse.json(await chargerCarton(id, scan));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
