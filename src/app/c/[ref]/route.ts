import { NextResponse } from "next/server";
import { parseCartonReference, formatCartonReference } from "@/lib/cartons/reference";

/**
 * Adresse courte encodée dans le QR code des cartons (…/c/CTN-00000123).
 * Redirige vers la fiche du carton ; la connexion est exigée par le proxy.
 */
export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const id = parseCartonReference(decodeURIComponent((await params).ref));
  const target = id ? `/cartons/${formatCartonReference(id)}` : "/cartons";
  return NextResponse.redirect(new URL(target, request.url), 302);
}
