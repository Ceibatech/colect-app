import { NextResponse, type NextRequest } from "next/server";
import { prepareDossier } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";
import { preparationInputSchema } from "@/lib/validation/preparation";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const parsed = preparationInputSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new ApiError(parsed.error.issues[0]?.message ?? "Informations de préparation invalides.");
    }
    const dossier = await prepareDossier(dossierId, parsed.data);
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
