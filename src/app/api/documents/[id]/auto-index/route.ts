import { NextResponse } from "next/server";
import { runAutomaticIndexing } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export const maxDuration = 300;

/** POST /api/documents/:id/auto-index — OCR, extraction et classement proposés. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await runAutomaticIndexing(parseIdParam(id));
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
