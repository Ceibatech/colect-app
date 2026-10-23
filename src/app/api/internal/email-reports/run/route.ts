import { NextResponse } from "next/server";
import { requireEmailReportScheduler } from "@/lib/auth/email-report-scheduler";
import { processDueEmailReports } from "@/lib/services/email-report-service";
import { processPendingTransferEmails } from "@/lib/services/transfer-notification-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    requireEmailReportScheduler(request);
    const reports = await processDueEmailReports();
    const transferAlerts = await processPendingTransferEmails();
    return NextResponse.json({ ...reports, transferAlerts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
