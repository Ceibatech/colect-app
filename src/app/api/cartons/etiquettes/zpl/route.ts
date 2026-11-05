import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/auth/current-user";
import { ApiError } from "@/lib/utils/api-error";
import { cartonScanUrl, getCartonSheet, getLabelCartons, getPublicOrigin } from "@/lib/services/carton-service";
import { cartonZpl, dossierZpl, reperesDossier, rollSize } from "@/lib/cartons/zebra-labels";
import { apiErrorResponse } from "@/lib/utils/api-response";

const positiveInt = (value: string | null) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

/**
 * Fichier ZPL (langage natif des imprimantes Zebra) des étiquettes : cartons
 * (mêmes filtres que la planche A4) ou dossiers d'un carton (?type=dossiers&carton=…).
 * Format du rouleau : ?l=…&h=… en mm (100 × 50 et 60 × 30 par défaut).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireApiUser();
    if (!session.permissions.includes("DOSSIER_READ") && !session.permissions.includes("TRANSFER_VIEW")) {
      throw new ApiError("Permission refusée.", 403);
    }
    const params = request.nextUrl.searchParams;
    const origin = await getPublicOrigin();
    let zpl: string[];
    let name: string;

    if (params.get("type") === "dossiers") {
      const carton = positiveInt(params.get("carton")) ? await getCartonSheet(positiveInt(params.get("carton"))!) : null;
      if (!carton) throw new ApiError("Carton introuvable.", 404);
      const size = rollSize("dossier", params.get("l"), params.get("h"));
      zpl = carton.dossiers.map((dossier) => dossierZpl({
        code: dossier.cote ?? dossier.reference,
        url: cartonScanUrl(origin, dossier.cote ?? carton.reference),
        rang: dossier.rangCarton,
        reperes: reperesDossier(dossier),
        reference: dossier.reference,
      }, size));
      name = `etiquettes-dossiers-${carton.reference}`;
    } else {
      const ids = (params.get("ids") ?? "").split(",").map((v) => positiveInt(v.trim())).filter((v): v is number => v !== undefined);
      const { rows } = await getLabelCartons({
        ids,
        q: params.get("q")?.trim().slice(0, 200) || undefined,
        siteId: positiveInt(params.get("site")),
        entrepotId: positiveInt(params.get("salle")),
      });
      const size = rollSize("carton", params.get("l"), params.get("h"));
      zpl = rows.map((row) => cartonZpl({
        reference: row.reference,
        url: cartonScanUrl(origin, row.reference),
        libelle: row.label,
        lieu: [row.site, row.salle].filter(Boolean).join(" · ") || null,
      }, size));
      name = `etiquettes-cartons-${rows.length}`;
    }

    return new NextResponse(`${zpl.join("\n")}\n`, {
      headers: {
        "Content-Type": "application/vnd.zebra-zpl; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}.zpl"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
