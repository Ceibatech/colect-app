import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { labelQrBase } from "@/lib/cartons/label-url";
import { prisma } from "@/lib/prisma/client";
import { resolveCartonRef } from "@/lib/services/carton-service";

/**
 * Adresse courte des anciens QR (…/c/2010-KOU-0001, ou …/c/CTN-00000123).
 * - Agent GeoArchiv connecté : fiche du carton, comme avant.
 * - Sans session, carton déjà versé au SAE : le scan est renvoyé vers le SAE (LABEL_QR_BASE),
 *   GeoArchiv n'est pas montré.
 * - Sinon : connexion GeoArchiv puis retour sur la fiche.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).trim().toUpperCase();
  const id = await resolveCartonRef(ref);
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    const base = labelQrBase();
    if (base && id && (await versedToSae(id))) {
      return NextResponse.redirect(`${base}/q/${encodeURIComponent(ref)}`, 302);
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("from", `/c/${ref}`);
    return NextResponse.redirect(login, 302);
  }
  const target = id ? `/cartons/${encodeURIComponent(ref)}` : "/cartons";
  return NextResponse.redirect(new URL(target, request.url), 302);
}

/** Le carton fait partie d'une réception déjà envoyée à MULCV. */
async function versedToSae(cartonId: number): Promise<boolean> {
  const lots = await prisma.transferLotItem.findMany({ where: { cartonId }, select: { transferLotId: true } });
  if (lots.length === 0) return false;
  const sent = await prisma.mulcvDelivery.count({ where: { status: "SENT", transferLotId: { in: lots.map((lot) => lot.transferLotId) } } });
  return sent > 0;
}
