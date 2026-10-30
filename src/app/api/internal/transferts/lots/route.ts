import { NextResponse } from "next/server";
import { z } from "zod";
import { actingAs } from "@/lib/auth/acting-session";
import { requireEmailReportScheduler } from "@/lib/auth/email-report-scheduler";
import type { SessionPayload } from "@/lib/auth/session";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";
import { prisma } from "@/lib/prisma/client";
import { createTransferLot, submitTransferLot } from "@/lib/services/transfer-actions";
import { searchTransferCartons } from "@/lib/services/transfer-service";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

export const runtime = "nodejs";

const schema = z.object({
  apply: z.boolean().default(false),
  userName: z.string().min(2),
  destinationSiteNom: z.string().min(2),
  plannedAt: z.string().min(10),
  transportMethod: z.string().min(2),
  plannedRoute: z.string().min(2),
  motif: z.string().default(""),
  plages: z.array(z.string().min(5)).min(1).max(10),
});

/**
 * Prépare des lots de transfert par plage de cotes, au nom d'un gestionnaire
 * désigné, puis les soumet à la validation interne (le circuit normal suit).
 * Réservé au serveur (jeton interne) ; « apply: false » ne fait que compter.
 */
export async function POST(request: Request) {
  try {
    requireEmailReportScheduler(request);
    const input = schema.parse(await request.json());
    const homonymes = await prisma.user.findMany({ where: { name: input.userName, isActive: true }, select: { id: true } });
    if (homonymes.length !== 1) throw new ApiError(`${homonymes.length} compte(s) actif(s) nommé(s) ${input.userName} : précisez.`, 409);
    const user = await prisma.user.findUnique({
      where: { id: homonymes[0].id },
      select: { id: true, email: true, name: true, isActive: true, sessionVersion: true, role: { select: { code: true, rolePermissions: { select: { permission: { select: { code: true } } } } } } },
    });
    if (!user?.isActive) throw new ApiError("Compte introuvable ou inactif.", 404);
    const session = {
      userId: user.id, email: user.email, name: user.name, roleCode: user.role.code as RoleCode,
      permissions: user.role.rolePermissions.map((entry) => entry.permission.code) as PermissionCode[],
      sessionVersion: user.sessionVersion,
    } as SessionPayload;
    if (!session.permissions.includes("TRANSFER_CREATE")) throw new ApiError("Ce compte ne peut pas créer de transfert.", 403);
    const destination = await prisma.site.findFirst({ where: { nom: input.destinationSiteNom, isActive: true }, select: { id: true } });
    if (!destination) throw new ApiError("Site de destination introuvable.", 404);

    const results = [];
    for (const plage of input.plages) {
      // Emplacement des cartons de la plage : site et salle où se trouvent leurs dossiers.
      const match = plage.match(/^(\d{4}-[A-Z][A-Z0-9]{1,5})-(\d+)\s*à\s*(\d+)$/);
      if (!match) throw new ApiError(`Plage invalide : ${plage}`, 400);
      const [prefixe, de, a] = [match[1], Number(match[2]), Number(match[3])];
      const lieux = await prisma.dossier.groupBy({
        by: ["siteId", "entrepotId"],
        where: { carton: { cotePrefixe: prefixe, coteSequence: { gte: de, lte: a } } },
        _count: { _all: true },
        orderBy: { _count: { id: "desc" } },
      });
      const lieu = lieux[0];
      if (!lieu?.siteId) throw new ApiError(`Aucun dossier localisé pour ${plage}.`, 409);
      const found = await searchTransferCartons({ sourceSiteId: lieu.siteId, sourceEntrepotId: lieu.entrepotId, includeUnlocated: false, q: plage, page: 1, pageSize: 200 });
      const summary = { plage, cartons: found.items.length, dossiers: found.items.reduce((sum, item) => sum + item.dossierCount, 0), autresEmplacements: lieux.length - 1, total: found.total };
      if (!input.apply) { results.push(summary); continue; }
      if (found.total > 200) throw new ApiError(`${plage} : plus de 200 cartons, découpez la plage.`, 400);
      const formData = new FormData();
      Object.entries({
        sourceSiteId: String(lieu.siteId), sourceEntrepotId: lieu.entrepotId ? String(lieu.entrepotId) : "",
        destinationSiteId: String(destination.id), destinationEntrepotId: "", includeUnlocated: "false",
        plannedAt: input.plannedAt, archiveSupport: "PHYSIQUE", plannedRoute: input.plannedRoute,
        transportMethod: input.transportMethod, motif: input.motif,
        cartonTokens: JSON.stringify(found.items.map((item) => item.token)),
      }).forEach(([key, value]) => formData.set(key, value));
      const created = await actingAs(session, () => createTransferLot({}, formData));
      if (!created.success || !created.lotId) throw new ApiError(`${plage} : ${created.error ?? "création refusée"}`, 409);
      const submitted = await actingAs(session, () => submitTransferLot(created.lotId!));
      const lot = await prisma.transferLot.findUnique({ where: { id: created.lotId }, select: { reference: true, status: true } });
      results.push({ ...summary, lotId: created.lotId, reference: lot?.reference, status: lot?.status, soumis: !submitted.error, erreur: submitted.error ?? null });
    }
    return NextResponse.json({ createdFor: user.name, results });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
