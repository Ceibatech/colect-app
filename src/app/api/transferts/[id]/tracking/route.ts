import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { transferTrackingPointSchema } from "@/lib/validation/transfer";
import { apiErrorResponse } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

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
    return NextResponse.json({ points: descending.reverse() });
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
    const capturedAt = new Date(parsed.data.capturedAt);
    if (capturedAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError("La date GPS ne peut pas être dans le futur.", 400);

    const lot = await prisma.transferLot.findFirst({
      where: { id: lotId, items: { some: { status: "SORTI" } } },
      select: { id: true },
    });
    if (!lot) throw new ApiError("Le suivi GPS est disponible uniquement lorsqu'un chargement est en transit.", 409);
    const lastPoint = await prisma.transferTrackingPoint.findFirst({
      where: { transferLotId: lotId, capturedById: session.userId },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    });
    if (lastPoint && capturedAt.getTime() - lastPoint.capturedAt.getTime() < 8_000) {
      throw new ApiError("Attendez quelques secondes avant le prochain point GPS.", 429);
    }

    const point = await prisma.transferTrackingPoint.create({
      data: {
        transferLotId: lotId,
        capturedById: session.userId,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        accuracy: parsed.data.accuracy,
        speed: parsed.data.speed,
        heading: parsed.data.heading,
        capturedAt,
      },
      select: { id: true, capturedAt: true },
    });
    return NextResponse.json({ point }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
