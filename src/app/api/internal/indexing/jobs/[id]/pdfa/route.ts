import { NextResponse } from "next/server";
import { requireIndexingWorker } from "@/lib/auth/indexing-worker";
import { storeIndexingPdfa } from "@/lib/services/automatic-indexing-service";
import { apiErrorResponse, parseIdParam } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireIndexingWorker(request);
    const workerId = request.headers.get("x-worker-id")?.trim();
    if (!workerId) throw new ApiError("Identité worker manquante.");
    const { id } = await params;
    const derivative = await storeIndexingPdfa(
      parseIdParam(id),
      workerId,
      Buffer.from(await request.arrayBuffer()),
    );
    return NextResponse.json({ id: derivative.id, hash: derivative.hash }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
