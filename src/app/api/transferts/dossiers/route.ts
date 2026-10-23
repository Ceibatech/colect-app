import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { apiErrorResponse } from "@/lib/utils/api-response";

export async function GET() {
  try {
    await requireApiPermission("TRANSFER_CREATE");
    return NextResponse.json(
      { error: "La sélection dossier par dossier a été remplacée par la sélection sécurisée des cartons." },
      { status: 410 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
