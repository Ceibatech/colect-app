import { NextResponse, type NextRequest } from "next/server";
import { archiveDossier } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    if (typeof body.emplacement !== "string" || !body.emplacement.trim()) {
      throw new ApiError("L'emplacement d'archivage est requis.");
    }
    const referenceArchivage = typeof body.referenceArchivage === "string" ? body.referenceArchivage : undefined;
    const dossier = await archiveDossier(dossierId, body.emplacement, referenceArchivage);
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
