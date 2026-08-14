import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { confirmImport, type ImportRowData } from "@/lib/services/import-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";
import { getClientIp } from "@/lib/utils/server-request";
import { prisma } from "@/lib/prisma/client";

/**
 * POST /api/import/confirm — étape CONFIRMATION + IMPORT (§54). Reçoit les
 * lignes déjà prévisualisées mais les revalide entièrement côté serveur
 * (jamais de confiance dans l'aperçu renvoyé par le client — §60).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireApiPermission("IMPORT_DATA");

    const body = await request.json().catch(() => null);
    if (!body || typeof body.fileName !== "string" || !Array.isArray(body.rows)) {
      throw new ApiError("Requête invalide.");
    }

    const rows = body.rows as ImportRowData[];
    if (rows.length === 0) {
      throw new ApiError("Aucune ligne à importer.");
    }
    if (rows.length > 5000) {
      throw new ApiError("Trop de lignes (5000 maximum par import).");
    }

    const result = await confirmImport(session.userId, body.fileName, rows);

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: "IMPORT_CONFIRM",
        entity: "IMPORT",
        entityId: result.importId,
        newValue: { fileName: body.fileName, imported: result.imported, skipped: result.skipped },
        ipAddress: await getClientIp(),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
