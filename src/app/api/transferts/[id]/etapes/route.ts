import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth/current-user";
import { recordSiteStep, SITE_STEPS } from "@/lib/services/convoy-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const schema = z.object({ etape: z.enum(Object.keys(SITE_STEPS) as [keyof typeof SITE_STEPS, ...Array<keyof typeof SITE_STEPS>]) });

/** Le responsable de site indique le début et la fin du chargement (départ) ou du déchargement (arrivée). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiPermission("TRANSFER_OPERATE");
    const lotId = Number((await params).id);
    if (!Number.isInteger(lotId) || lotId <= 0) throw new ApiError("Lot invalide.", 400);
    const { etape } = schema.parse(await request.json());
    const result = await recordSiteStep(session, lotId, etape);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
