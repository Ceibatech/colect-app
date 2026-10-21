import { NextResponse, type NextRequest } from "next/server";
import { preindexDocument } from "@/lib/services/document-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

/** PATCH /api/documents/:id/preindex — enregistre les métadonnées de pré-indexation. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const documentId = parseIdParam(id);
    const document = await preindexDocument(documentId, await request.json());
    return NextResponse.json({ document });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
