import { NextResponse } from "next/server";
import { requireEmailReportScheduler } from "@/lib/auth/email-report-scheduler";
import { backfillMulcvReceptions } from "@/lib/services/mulcv-sync-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

export const runtime = "nodejs";

/**
 * Met en file, une fois, les prises en charge déjà reçues avant la mise en service de l'envoi
 * vers MULCV. Sans effet sur ce qui est déjà en file : peut être relancé sans risque.
 */
export async function POST(request: Request) {
  try {
    requireEmailReportScheduler(request);
    return NextResponse.json(await backfillMulcvReceptions());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
