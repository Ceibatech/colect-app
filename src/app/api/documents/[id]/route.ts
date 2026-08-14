import { NextResponse, type NextRequest } from "next/server";
import { deleteDocument } from "@/lib/services/document-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

/** DELETE /api/documents/:id — suppression selon permissions (§56). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const documentId = parseIdParam(id);
    await deleteDocument(documentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
