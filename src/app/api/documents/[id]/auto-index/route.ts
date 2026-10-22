import { NextResponse } from "next/server";
import { queueDocumentAutomaticIndexing } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

/** POST /api/documents/:id/auto-index — place le document dans la file LAD/IA. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await queueDocumentAutomaticIndexing(parseIdParam(id));
    return NextResponse.json(result, { status: result.queued ? 202 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
