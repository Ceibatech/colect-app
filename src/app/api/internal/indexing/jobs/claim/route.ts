import { NextResponse } from "next/server";
import { requireIndexingWorker } from "@/lib/auth/indexing-worker";
import { claimNextIndexingJob } from "@/lib/services/automatic-indexing-service";
import { workerIdentitySchema } from "@/lib/validation/indexing-worker";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function POST(request: Request) {
  try {
    requireIndexingWorker(request);
    const parsed = workerIdentitySchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Identité worker invalide.");
    const job = await claimNextIndexingJob(parsed.data.workerId);
    return NextResponse.json({ job });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
