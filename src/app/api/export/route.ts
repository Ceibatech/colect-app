import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { buildExport, type ExportFilters } from "@/lib/services/export-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";
import { prisma } from "@/lib/prisma/client";
import { getClientIp } from "@/lib/utils/server-request";

/** GET /api/export — export CSV/Excel filtré (§55). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiPermission("EXPORT_DATA");

    const params = request.nextUrl.searchParams;
    const format = params.get("format") === "xlsx" ? "xlsx" : "csv";

    const filters: ExportFilters = {
      q: params.get("q") ?? undefined,
      communeId: params.get("commune") ? Number(params.get("commune")) : undefined,
      operateurId: params.get("operateur") ? Number(params.get("operateur")) : undefined,
      statutValidation: params.get("statutValidation") ?? undefined,
      statutArchivage: params.get("statutArchivage") ?? undefined,
      nonIndexes: params.get("nonIndexes") === "1",
      dateFrom: params.get("from") ? new Date(params.get("from")!) : undefined,
      dateTo: params.get("to") ? new Date(params.get("to")!) : undefined,
    };

    if (filters.dateFrom && Number.isNaN(filters.dateFrom.getTime())) throw new ApiError("Date de début invalide.");
    if (filters.dateTo && Number.isNaN(filters.dateTo.getTime())) throw new ApiError("Date de fin invalide.");

    const result = await buildExport(filters, format, session);

    await Promise.all([
      prisma.export.create({
        data: {
          userId: session.userId,
          typeExport: format.toUpperCase(),
          filtres: JSON.parse(JSON.stringify(filters)),
          nombreLignes: result.count,
          fichier: result.fileName,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.userId,
          action: "EXPORT",
          entity: "DOSSIER",
          newValue: { format, count: result.count },
          ipAddress: await getClientIp(),
        },
      }),
    ]);

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
