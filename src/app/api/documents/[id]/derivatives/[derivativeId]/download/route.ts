import { NextResponse } from "next/server";
import { getDocumentDerivativeForDownload } from "@/lib/services/document-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; derivativeId: string }> },
) {
  try {
    const { id, derivativeId } = await params;
    const { derivative, originalName, buffer } = await getDocumentDerivativeForDownload(
      parseIdParam(id),
      parseIdParam(derivativeId),
    );
    const baseName = originalName.replace(/\.[^.]+$/, "");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": derivative.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}-OCR-PDFA.pdf`)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
