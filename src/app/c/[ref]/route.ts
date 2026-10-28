import { NextResponse } from "next/server";
import { resolveCartonRef } from "@/lib/services/carton-service";

/**
 * Adresse courte encodée dans le QR code des cartons (…/c/2010-KOU-0001, ou
 * l'ancien …/c/CTN-00000123). Redirige vers la fiche du carton ; la connexion
 * est exigée par le proxy.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const ref = decodeURIComponent((await params).ref).trim().toUpperCase();
  const id = await resolveCartonRef(ref);
  const target = id ? `/cartons/${encodeURIComponent(ref)}` : "/cartons";
  return NextResponse.redirect(new URL(target, request.url), 302);
}
