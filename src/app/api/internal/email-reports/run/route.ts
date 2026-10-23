import { NextResponse } from "next/server";
import { requireEmailReportScheduler } from "@/lib/auth/email-report-scheduler";
import { processDueEmailReports } from "@/lib/services/email-report-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireEmailReportScheduler(request);
    return NextResponse.json(await processDueEmailReports());
  } catch (error) {
    return apiErrorResponse(error);
  }
}
