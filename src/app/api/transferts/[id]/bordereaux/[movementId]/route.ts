import { createTransferMovementPdf } from "@/lib/documents/transfer-pdf";
import { getTransferBordereau } from "@/lib/services/transfer-service";
import { getTransferMovementStatusLabel, type TransferMovementStatusCode } from "@/lib/utils/transfer-stock";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; movementId: string }> }) {
  const { id, movementId: movementParam } = await params;
  const lotId = Number(id);
  const movementId = Number(movementParam);
  if (!Number.isInteger(lotId) || !Number.isInteger(movementId) || lotId <= 0 || movementId <= 0) {
    return new Response("Bordereau invalide.", { status: 400 });
  }

  const movement = await getTransferBordereau(lotId, movementId);
  if (!movement) return new Response("Bordereau introuvable.", { status: 404 });

  const pdf = await createTransferMovementPdf({
    reference: movement.reference,
    lotReference: movement.transferLot.reference,
    type: movement.type,
    statusLabel: getTransferMovementStatusLabel(movement.status as TransferMovementStatusCode),
    occurredAt: movement.occurredAt,
    source: placeLabel(movement.transferLot.sourceSite.nom, movement.transferLot.sourceEntrepot),
    sourceAddress: siteAddress(movement.transferLot.sourceSite),
    destination: placeLabel(movement.transferLot.destinationSite.nom, movement.transferLot.destinationEntrepot),
    destinationAddress: siteAddress(movement.transferLot.destinationSite),
    conditionLabel: movement.conditionStatus ? conditionLabel(movement.conditionStatus) : null,
    observations: movement.observations,
    plannedRoute: movement.transferLot.plannedRoute,
    vehicleRegistration: movement.vehicleRegistration,
    vehicleDescription: movement.vehicleDescription,
    driverName: movement.driverName,
    driverPhone: movement.driverPhone,
    ceibaEscortName: movement.ceibaEscortName,
    sealReferences: movement.sealReferences,
    sealStatusLabel: movement.sealStatus ? sealStatusLabel(movement.sealStatus) : null,
    incidentReported: movement.incidentReported,
    incidentDescription: movement.incidentDescription,
    items: movement.items.map((entry) => ({
      cartonCode: entry.transferLotItem.cartonCode,
      cartonLabel: entry.transferLotItem.cartonLabel,
      dossierCount: entry.transferLotItem.dossierCountSnapshot,
      dossierReferences: entry.transferLotItem.dossiers.map((link) => link.dossier.reference),
    })),
    signatures: movement.signatures.map((signature) => ({
      party: signature.party,
      label: signatureLabel(signature.party, movement.type),
      name: signature.signatoryName,
      title: signature.signatoryTitle,
      signedAt: signature.signedAt,
      data: signature.signatureData,
    })),
  });

  const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
  return new Response(new Uint8Array(pdf).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documentCode}-${movement.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function placeLabel(site: string, warehouse?: { nom: string; localisation: string | null } | null) {
  return warehouse ? [site, warehouse.nom, warehouse.localisation].filter(Boolean).join(" - ") : site;
}

function siteAddress(site: { adresse: string | null; adresseGps: string | null; quartier: string | null; ville: string | null; region: string | null }) {
  return [site.adresseGps ?? site.adresse, site.quartier, site.ville, site.region].filter(Boolean).join(" - ") || "Adresse à compléter";
}

function signatureLabel(party: "MINISTERE" | "CEIBAC" | "CEIBAC_VALIDATOR", type: "SORTIE" | "RECEPTION" | "RETOUR") {
  if (party === "MINISTERE") return type === "RECEPTION" ? "Visa final du ministère" : "Remis ou réceptionné par le ministère";
  if (party === "CEIBAC_VALIDATOR") return "Validation interne";
  return type === "RECEPTION" ? "Constat de l'agent CEIBA à l'arrivée" : "Pris en charge par CEIBA Analytics";
}

function conditionLabel(status: "CONFORME" | "AVEC_RESERVES" | "NON_CONFORME") {
  return { CONFORME: "Conforme", AVEC_RESERVES: "Conforme avec réserves", NON_CONFORME: "Non conforme" }[status];
}

function sealStatusLabel(status: "INTACTS" | "ANOMALIE" | "NON_APPLICABLE") {
  return { INTACTS: "Intacts et concordants", ANOMALIE: "Anomalie constatée", NON_APPLICABLE: "Non applicable" }[status];
}
