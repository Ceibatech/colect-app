import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { generateImportTemplate } from "@/lib/services/import-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** GET /api/import/template — modèle .xlsx vierge pour l'import (§54). */
export async function GET() {
  try {
    await requireApiPermission("IMPORT_DATA");
    const buffer = await generateImportTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modele-import-dossiers.xlsx"',
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
