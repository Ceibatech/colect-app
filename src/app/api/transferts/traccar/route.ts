import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getTrackerToken } from "@/lib/services/convoy-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** Identifiant Traccar Client du convoyeur connecté. */
export async function GET() {
  try {
    const session = await requireApiPermission("TRANSFER_TRACK");
    return NextResponse.json(await getTrackerToken(session.userId));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
