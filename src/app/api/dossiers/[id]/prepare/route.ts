import { NextResponse, type NextRequest } from "next/server";
import { prepareDossier } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    const dossier = await prepareDossier(dossierId, {
      nombrePieces: typeof body.nombrePieces === "number" ? body.nombrePieces : undefined,
      typesPieces: Array.isArray(body.typesPieces) ? body.typesPieces.filter((t: unknown) => typeof t === "string") : undefined,
      autresPieces: typeof body.autresPieces === "string" ? body.autresPieces : undefined,
      nombrePages: typeof body.nombrePages === "number" ? body.nombrePages : undefined,
    });
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
