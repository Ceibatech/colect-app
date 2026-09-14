import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { getFinanceDashboardData } from "@/lib/services/finance-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { prisma } from "@/lib/prisma/client";
import { getClientIp } from "@/lib/utils/server-request";

function csvCell(value: string | number): string {
  const text = String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiPermission("FINANCE_VIEW");
    const data = await getFinanceDashboardData(request.nextUrl.searchParams.get("month") ?? undefined);
    const rows: Array<Array<string | number>> = [
      ["Type", "Personne", "Matricule", "Collecte", "Numérisation", "Indexation", "Archivage", "Validations", "Rejets", "Points", `Projection ${data.summary.currency}`],
      ...data.operatorRows.map((row) => ["Opérateur", row.name, row.matricule, row.activities.COLLECTE, row.activities.NUMERISATION, row.activities.INDEXATION, row.activities.ARCHIVAGE, "", "", row.points, row.projectedAmount]),
      ...data.supervisorRows.map((row) => ["Superviseur", row.name, "", "", "", "", "", row.validations, row.rejections, row.points, row.projectedAmount]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "FINANCE_EXPORT",
        entity: "FINANCE_DASHBOARD",
        newValue: { month: data.period.key, operatorRows: data.operatorRows.length, supervisorRows: data.supervisorRows.length },
        ipAddress: await getClientIp(),
      },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pilotage-financier-${data.period.key}.csv"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}