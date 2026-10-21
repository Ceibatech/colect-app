import { after, NextResponse } from "next/server";
import { requestDigitalArchiveRetry, processDossierDigitalArchive } from "@/lib/services/digital-archive-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const result = await requestDigitalArchiveRetry(dossierId);
    if (result.queued > 0) {
      after(() => processDossierDigitalArchive(dossierId, result.actorUserId));
    }
    return NextResponse.json({ queued: result.queued }, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
