import { NextResponse, type NextRequest } from "next/server";
import { uploadDocument } from "@/lib/services/document-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

/** POST /api/dossiers/:id/documents — ajout d'un document (§56). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("Aucun fichier fourni.");
    }

    const document = await uploadDocument(dossierId, file);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
