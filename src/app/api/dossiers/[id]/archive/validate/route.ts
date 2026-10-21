import { after, NextResponse, type NextRequest } from "next/server";
import { validateArchivage } from "@/lib/services/workflow-service";
import { processDossierDigitalArchive } from "@/lib/services/digital-archive-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dossierId = parseIdParam(id);
    const body = await request.json().catch(() => ({}));
    const result = await validateArchivage(
      dossierId,
      typeof body.commentaire === "string" ? body.commentaire : undefined,
    );
    if (result.digitalArchive.queued > 0) {
      after(() => processDossierDigitalArchive(dossierId, result.digitalArchive.actorUserId));
    }
    return NextResponse.json({
      dossier: result.dossier,
      digitalArchiveQueued: result.digitalArchive.queued,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
