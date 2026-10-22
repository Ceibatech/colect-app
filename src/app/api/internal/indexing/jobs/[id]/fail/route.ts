import { NextResponse } from "next/server";
import { requireIndexingWorker } from "@/lib/auth/indexing-worker";
import { failIndexingJob } from "@/lib/services/automatic-indexing-service";
import { indexingWorkerFailureSchema } from "@/lib/validation/indexing-worker";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireIndexingWorker(request);
    const parsed = indexingWorkerFailureSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Erreur worker invalide.");
    const { id } = await params;
    return NextResponse.json(await failIndexingJob(parseIdParam(id), parsed.data));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
