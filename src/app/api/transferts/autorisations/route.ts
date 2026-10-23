import { createTransferAuthorizationPdf } from "@/lib/documents/transfer-pdf";
import { getTransferAuthorizationGroup } from "@/lib/services/transfer-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const sourceSiteId = positiveInt(params.get("sourceSiteId"));
  const destinationSiteId = positiveInt(params.get("destinationSiteId"));
  const sourceEntrepotId = nullablePositiveInt(params.get("sourceEntrepotId"));
  const destinationEntrepotId = nullablePositiveInt(params.get("destinationEntrepotId"));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !sourceSiteId || !destinationSiteId || sourceEntrepotId === undefined || destinationEntrepotId === undefined) {
    return new Response("Opération de transfert invalide.", { status: 400 });
  }

  const operation = await getTransferAuthorizationGroup({
    date,
    sourceSiteId,
    sourceEntrepotId,
    destinationSiteId,
    destinationEntrepotId,
  });
  if (!operation) return new Response("Opération de transfert introuvable.", { status: 404 });
  if (!operation.ready || !operation.authorizedAt) {
    return new Response("La F01 sera disponible lorsque tous les lots de cette opération auront été autorisés.", { status: 409 });
  }

  const pdf = await createTransferAuthorizationPdf({
    reference: operation.reference,
    lotReferences: operation.lotReferences,
    authorizedAt: operation.authorizedAt,
    plannedAt: operation.plannedAt,
    motif: operation.motif,
    archiveSupport: operation.archiveSupport,
    plannedRoute: operation.plannedRoute,
    transportMethod: operation.transportMethod,
    ceibaParticipants: operation.ceibaParticipants,
    sdaParticipants: operation.sdaParticipants,
    riskAssessment: operation.riskAssessment,
    securityMeasures: operation.securityMeasures,
    source: placeLabel(operation.sourceSite.nom, operation.sourceEntrepot),
    sourceAddress: siteAddress(operation.sourceSite),
    destination: placeLabel(operation.destinationSite.nom, operation.destinationEntrepot),
    destinationAddress: siteAddress(operation.destinationSite),
    ministryContact: uniqueNames(operation.ministrySignatures.map((signature) => signature.name), "Responsable du ministère"),
    ceibaContact: operation.ceibaContacts.join(", "),
    items: operation.items.map((item) => ({
      lotReference: item.lotReference,
      cartonCode: item.cartonCode,
      cartonLabel: item.cartonLabel,
      dossierCount: item.dossierCountSnapshot,
      dossierReferences: item.dossiers.map((entry) => entry.dossier.reference),
    })),
    ceibaSignatures: operation.ceibaSignatures.map((signature) => ({
      ...signature,
      party: "CEIBAC_VALIDATOR",
      label: "Validation interne",
    })),
    ministrySignatures: operation.ministrySignatures.map((signature) => ({
      ...signature,
      party: "MINISTERE",
      label: "Autorisation du ministère",
    })),
  });

  return new Response(new Uint8Array(pdf).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="F01-${operation.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function positiveInt(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nullablePositiveInt(value: string | null): number | null | undefined {
  if (value === "none") return null;
  const parsed = positiveInt(value);
  return parsed ?? undefined;
}

function placeLabel(site: string, warehouse?: { nom: string; localisation: string | null } | null) {
  return warehouse ? [site, warehouse.nom, warehouse.localisation].filter(Boolean).join(" - ") : site;
}

function siteAddress(site: { adresse: string | null; adresseGps: string | null; quartier: string | null; ville: string | null; region: string | null }) {
  return [site.adresseGps ?? site.adresse, site.quartier, site.ville, site.region].filter(Boolean).join(" - ") || "Adresse à compléter";
}

function uniqueNames(values: Array<string | null>, fallback: string) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).join(", ") || fallback;
}
