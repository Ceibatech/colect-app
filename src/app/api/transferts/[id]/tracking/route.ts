import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { transferTrackingPointSchema } from "@/lib/validation/transfer";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";
import { getConvoyOverview, recordTrackingPoint } from "@/lib/services/convoy-service";

function parseLotId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError("Lot invalide.", 400);
  return id;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiPermission("TRANSFER_VIEW");
    const lotId = parseLotId((await params).id);
    const lot = await prisma.transferLot.findUnique({ where: { id: lotId }, select: { id: true } });
    if (!lot) throw new ApiError("Lot introuvable.", 404);
    const descending = await prisma.transferTrackingPoint.findMany({
      where: { transferLotId: lotId },
      orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true, latitude: true, longitude: true, accuracy: true, speed: true, heading: true, capturedAt: true, capturedBy: { select: { name: true } } },
    });
    const convoy = await getConvoyOverview(lotId);
    return NextResponse.json({ points: descending.reverse(), ...convoy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApiPermission("TRANSFER_TRACK");
    const lotId = parseLotId((await params).id);
    const parsed = transferTrackingPointSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Coordonnées invalides.", 400);
    const result = await recordTrackingPoint(session, lotId, { ...parsed.data, capturedAt: new Date(parsed.data.capturedAt) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
