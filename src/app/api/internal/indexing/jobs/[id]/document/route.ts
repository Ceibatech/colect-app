import { NextResponse } from "next/server";
import { requireIndexingWorker } from "@/lib/auth/indexing-worker";
import { readIndexingJobDocument } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireIndexingWorker(request);
    const workerId = request.headers.get("x-worker-id")?.trim();
    if (!workerId) throw new ApiError("Identité worker manquante.");
    const { id } = await params;
    const { document, buffer } = await readIndexingJobDocument(parseIdParam(id), workerId);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.typeMime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.nomOriginal)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
