import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiPermission } from "@/lib/auth/current-user";
import { CLASSEMENT_ACD, cotePrefixe, formatCartonCote, formatDossierCote, proposeSigle, SIGLE_INCONNU } from "@/lib/cartons/cote";
import { findCartonByCote } from "@/lib/cartons/cote-assignment";
import { normalizeCartonLabel } from "@/lib/cartons/identity-normalization";
import { cartonLabelKeySql } from "@/lib/cartons/persistence";
import { prisma } from "@/lib/prisma/client";
import { apiErrorResponse } from "@/lib/utils/api-response";

const positive = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function describe(cartonId: number, draftId: number | null) {
  const [carton, stats, sample, own] = await Promise.all([
    prisma.carton.findUnique({ where: { id: cartonId }, select: { cote: true } }),
    prisma.dossier.aggregate({ where: { cartonId, ...(draftId ? { id: { not: draftId } } : {}) }, _count: { _all: true }, _max: { rangCarton: true } }),
    prisma.dossier.findFirst({ where: { cartonId }, orderBy: { id: "asc" }, select: { libelleCarton: true, site: { select: { nom: true } }, commune: { select: { nom: true } } } }),
    draftId ? prisma.dossier.findFirst({ where: { id: draftId, cartonId }, select: { cote: true } }) : null,
  ]);
  const rang = (stats._max.rangCarton ?? 0) + 1;
  return {
    mode: "existant" as const,
    cote: carton?.cote ?? null,
    libelle: sample?.libelleCarton ?? null,
    site: sample?.site?.nom ?? null,
    commune: sample?.commune?.nom ?? null,
    dossiers: stats._count._all,
    prochaineCote: own?.cote ?? (carton?.cote ? formatDossierCote(carton.cote, rang) : null),
    rang,
  };
}

/**
 * Aperçu pour le formulaire d'inventaire : le carton que recevra le dossier
 * (désigné par sa cote, ou reconnu par son libellé sur le site) et la cote du
 * dossier (n+1). Sans carton existant : la cote que prendra le nouveau carton.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiPermission("DOSSIER_CREATE");
    const params = request.nextUrl.searchParams;
    const draftId = positive(params.get("dossier"));
    const cote = params.get("cote")?.trim();
    if (cote) {
      const carton = await findCartonByCote(prisma, cote);
      if (!carton) return NextResponse.json({ mode: "inconnu", cote });
      return NextResponse.json(await describe(carton.id, draftId));
    }
    const siteId = positive(params.get("site"));
    const key = normalizeCartonLabel(params.get("libelle"));
    if (key) {
      const [match] = await prisma.$queryRaw<Array<{ cartonId: number | null }>>(Prisma.sql`
        SELECT MIN(d.carton_id) AS cartonId FROM dossiers d
        WHERE d.carton_id IS NOT NULL AND d.site_id <=> ${siteId}
          AND CONVERT(${cartonLabelKeySql(Prisma.sql`d.libelle_carton`)} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(${key} USING utf8mb4) COLLATE utf8mb4_unicode_ci`);
      if (match?.cartonId) return NextResponse.json(await describe(Number(match.cartonId), draftId));
    }
    const communeId = positive(params.get("commune"));
    const commune = communeId ? await prisma.commune.findUnique({ where: { id: communeId }, select: { nom: true, sigle: true } }) : null;
    const prefixe = cotePrefixe(commune ? commune.sigle ?? proposeSigle(commune.nom) : SIGLE_INCONNU, CLASSEMENT_ACD);
    const last = await prisma.carton.aggregate({ where: { cotePrefixe: prefixe }, _max: { coteSequence: true } });
    const next = formatCartonCote(prefixe, (last._max.coteSequence ?? 0) + 1);
    return NextResponse.json({ mode: "nouveau", cote: next, commune: commune?.nom ?? null, dossiers: 0, prochaineCote: formatDossierCote(next, 1), rang: 1 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
