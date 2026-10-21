import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { searchTransferDossiers } from "@/lib/services/transfer-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireApiPermission("TRANSFER_CREATE");
    const params = request.nextUrl.searchParams;
    const sourceSiteId = Number(params.get("site"));
    const warehouse = params.get("entrepot");
    const page = Math.max(1, Number(params.get("page")) || 1);

    if (!Number.isInteger(sourceSiteId) || sourceSiteId <= 0) {
      throw new ApiError("Le site de départ est invalide.", 400);
    }
    const sourceEntrepotId = warehouse && warehouse !== "none" ? Number(warehouse) : null;
    if (sourceEntrepotId !== null && (!Number.isInteger(sourceEntrepotId) || sourceEntrepotId <= 0)) {
      throw new ApiError("L'entrepôt de départ est invalide.", 400);
    }

    const result = await searchTransferDossiers({
      sourceSiteId,
      sourceEntrepotId,
      q: params.get("q") ?? undefined,
      page,
      pageSize: 40,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
