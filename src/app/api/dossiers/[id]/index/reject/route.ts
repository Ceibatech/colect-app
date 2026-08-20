import { NextResponse, type NextRequest } from "next/server";
import { rejectIndexation } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    if (typeof body.commentaire !== "string" || !body.commentaire.trim()) {
      throw new ApiError("Un motif de rejet est requis.");
    }
    const dossier = await rejectIndexation(dossierId, body.commentaire);
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
