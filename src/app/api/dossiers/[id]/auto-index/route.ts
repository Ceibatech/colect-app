import { NextResponse } from "next/server";
import { queueDossierAutomaticIndexing } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

/** POST /api/dossiers/:id/auto-index — met tous les scans en file LAD/IA. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await queueDossierAutomaticIndexing(parseIdParam(id));
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
