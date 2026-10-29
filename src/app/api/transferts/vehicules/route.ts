import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { apiErrorResponse } from "@/lib/utils/api-response";

/** Véhicules et chauffeurs déjà utilisés, proposés en liste pour éviter de tout ressaisir. */
export async function GET() {
  try {
    await requireApiPermission("TRANSFER_OPERATE");
    const rows = await prisma.transferMovement.findMany({
      where: { OR: [{ vehicleRegistration: { not: null } }, { driverName: { not: null } }] },
      orderBy: { occurredAt: "desc" },
      take: 300,
      select: { vehicleRegistration: true, vehicleDescription: true, driverName: true, driverPhone: true },
    });
    const unique = (values: Array<string | null>) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value))].slice(0, 30);
    const phones = new Map<string, string>();
    for (const row of rows) if (row.driverName && row.driverPhone && !phones.has(row.driverName.trim())) phones.set(row.driverName.trim(), row.driverPhone.trim());
    return NextResponse.json({
      registrations: unique(rows.map((row) => row.vehicleRegistration)),
      descriptions: unique(rows.map((row) => row.vehicleDescription)),
      drivers: unique(rows.map((row) => row.driverName)).map((name) => ({ name, phone: phones.get(name) ?? null })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
