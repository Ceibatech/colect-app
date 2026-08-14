import { NextResponse, type NextRequest } from "next/server";
import { numerizeDossier } from "@/lib/services/workflow-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    const nombrePages = typeof body.nombrePages === "number" ? body.nombrePages : undefined;
    const dossier = await numerizeDossier(dossierId, nombrePages);
    return NextResponse.json({ dossier });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
