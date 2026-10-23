import { createTransferAuthorizationPdf } from "@/lib/documents/transfer-pdf";
import { getTransferAuthorization } from "@/lib/services/transfer-service";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const lotId = Number((await params).id);
  if (!Number.isInteger(lotId) || lotId <= 0) return new Response("Lot invalide.", { status: 400 });

  const lot = await getTransferAuthorization(lotId);
  if (!lot || !lot.authorizedAt) return new Response("Autorisation introuvable.", { status: 404 });
  if (lot.plannedAt) {
    const query = new URLSearchParams({
      date: lot.plannedAt.toISOString().slice(0, 10),
      sourceSiteId: String(lot.sourceSiteId),
      sourceEntrepotId: lot.sourceEntrepotId === null ? "none" : String(lot.sourceEntrepotId),
      destinationSiteId: String(lot.destinationSiteId),
      destinationEntrepotId: lot.destinationEntrepotId === null ? "none" : String(lot.destinationEntrepotId),
    });
    return Response.redirect(new URL(`/api/transferts/autorisations?${query.toString()}`, request.url), 307);
  }

  const pdf = await createTransferAuthorizationPdf({
    reference: lot.reference,
    authorizedAt: lot.authorizedAt,
    plannedAt: lot.plannedAt,
    motif: lot.motif,
    source: placeLabel(lot.sourceSite.nom, lot.sourceEntrepot),
    sourceAddress: siteAddress(lot.sourceSite),
    destination: placeLabel(lot.destinationSite.nom, lot.destinationEntrepot),
    destinationAddress: siteAddress(lot.destinationSite),
    ministryContact: lot.approvalSignatoryName ?? lot.authorizedBy?.name ?? lot.sourceSite.responsable ?? "Responsable du ministère",
    ceibaContact: lot.createdBy.name,
    items: lot.items.map((item) => ({
      cartonCode: item.cartonCode,
      cartonLabel: item.cartonLabel,
      dossierCount: item.dossierCountSnapshot,
      dossierReferences: item.dossiers.map((entry) => entry.dossier.reference),
    })),
    ministrySignature: {
      party: "MINISTERE",
      label: "Autorité habilitée du ministère",
      name: lot.approvalSignatoryName ?? lot.authorizedBy?.name ?? null,
      title: lot.approvalSignatoryTitle,
      signedAt: lot.authorizedAt,
      data: lot.approvalSignatureData,
    },
  });

  return pdfResponse(pdf, `F01-${lot.reference}.pdf`);
}

function placeLabel(site: string, warehouse?: { nom: string; localisation: string | null } | null) {
  return warehouse ? [site, warehouse.nom, warehouse.localisation].filter(Boolean).join(" - ") : site;
}

function siteAddress(site: { adresse: string | null; adresseGps: string | null; quartier: string | null; ville: string | null; region: string | null }) {
  return [site.adresseGps ?? site.adresse, site.quartier, site.ville, site.region].filter(Boolean).join(" - ") || "Adresse à compléter";
}

function pdfResponse(pdf: Uint8Array, filename: string) {
  return new Response(new Uint8Array(pdf).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
