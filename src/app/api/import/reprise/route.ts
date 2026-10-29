import { NextResponse } from "next/server";
import { deposerFiches } from "@/lib/services/reprise-fiches-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** Dépose les fiches terrain (Excel) ; la reprise est lancée ensuite (simulation puis application). */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("fiches").filter((value): value is File => value instanceof File);
    return NextResponse.json(await deposerFiches(files), { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
