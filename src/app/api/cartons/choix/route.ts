import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { listCartons } from "@/lib/services/carton-service";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** Cartons proposés dans le formulaire d'inventaire (« Ajouter au carton ») : cote, libellé, nombre de dossiers. */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission("DOSSIER_CREATE");
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 80);
    const site = Number(params.get("site"));
    if (q.length < 2) return NextResponse.json({ cartons: [] });
    const { rows } = await listCartons({ q, siteId: Number.isInteger(site) && site > 0 ? site : undefined, page: 1 });
    return NextResponse.json({
      cartons: rows.slice(0, 8).map((row) => ({ cote: row.reference, libelle: row.label, dossiers: row.dossiers, site: row.site })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
