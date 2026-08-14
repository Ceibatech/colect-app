import { NextResponse, type NextRequest } from "next/server";
import { getDocumentForDownload } from "@/lib/services/document-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

/** GET /api/documents/:id/download — téléchargement selon permissions (§56). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const documentId = parseIdParam(id);
    const { document, buffer } = await getDocumentForDownload(documentId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.typeMime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.nomOriginal)}"`,
        "Content-Length": String(document.taille),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
