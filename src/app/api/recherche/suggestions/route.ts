import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { SUGGEST_STAGES, type SuggestStage } from "@/lib/search/suggestions";
import { suggestForStage } from "@/lib/services/search-suggest-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const PERMISSIONS = {
  preparation: "PREPARATION_VIEW",
  numerisation: "NUMERISATION_VIEW",
  conditionnement: "CONDITIONNEMENT_VIEW",
  indexation: "INDEXATION_VIEW",
  archivage: "ARCHIVAGE_VIEW",
} as const;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const stage = params.get("stage") as SuggestStage | null;
    if (!stage || !SUGGEST_STAGES.includes(stage)) throw new ApiError("Étape inconnue.", 400);
    await requireApiPermission(PERMISSIONS[stage]);
    const q = (params.get("q") ?? "").trim().slice(0, 120);
    const result = await suggestForStage(stage, q);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
