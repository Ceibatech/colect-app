import { NextResponse, type NextRequest } from "next/server";
import { indexDossier } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    const scoreQualite = typeof body.scoreQualite === "number" ? body.scoreQualite : undefined;
    const dossier = await indexDossier(dossierId, scoreQualite);
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
