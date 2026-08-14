import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { parseAndValidateImport } from "@/lib/services/import-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

/** POST /api/import — étape LECTURE + VALIDATION + DÉTECTION DOUBLONS (§54). Ne modifie jamais la base. */
export async function POST(request: NextRequest) {
  try {
    await requireApiPermission("IMPORT_DATA");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("Aucun fichier fourni.");
    }
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      throw new ApiError("Format non supporté — utilisez un fichier .csv ou .xlsx.");
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new ApiError("Fichier trop volumineux (5 Mo maximum).");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await parseAndValidateImport(buffer, file.name);
    return NextResponse.json(preview);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
