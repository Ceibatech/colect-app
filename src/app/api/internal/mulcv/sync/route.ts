import { NextResponse } from "next/server";
import { requireEmailReportScheduler } from "@/lib/auth/email-report-scheduler";
import { processPendingMulcvDeliveries } from "@/lib/services/mulcv-sync-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

export const runtime = "nodejs";

/** Envoie à MULCV les caisses reçues en attente. Appelé par l'ordonnanceur (jeton interne). */
export async function POST(request: Request) {
  try {
    requireEmailReportScheduler(request);
    return NextResponse.json(await processPendingMulcvDeliveries());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
