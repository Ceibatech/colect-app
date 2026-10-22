import { NextResponse } from "next/server";
import { runDossierAutomaticIndexing } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export const maxDuration = 300;

/** POST /api/dossiers/:id/auto-index — traite tous les scans du dossier. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await runDossierAutomaticIndexing(parseIdParam(id));
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
