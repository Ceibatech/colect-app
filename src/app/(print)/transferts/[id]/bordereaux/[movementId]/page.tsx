import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { getTransferBordereau } from "@/lib/services/transfer-service";
import { caissesDuMouvement } from "@/lib/services/caisse-service";
import { getTransferMovementLabel, getTransferMovementStatusLabel, type TransferMovementStatusCode, type TransferMovementTypeCode } from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

export const metadata = { title: "Bordereau de transfert - GeoArchives" };

export default async function TransferSlipPage({ params }: { params: Promise<{ id: string; movementId: string }> }) {
  const { id: idParam, movementId: movementIdParam } = await params;
  const lotId = Number(idParam);
  const movementId = Number(movementIdParam);
  if (!Number.isInteger(lotId) || !Number.isInteger(movementId) || lotId <= 0 || movementId <= 0) notFound();

  const movement = await getTransferBordereau(lotId, movementId);
  if (!movement) notFound();
  const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
  const ministrySignature = movement.signatures.find((signature) => signature.party === "MINISTERE");
  const ceibaSignature = movement.signatures.find((signature) => signature.party === "CEIBAC");
  const ceibaValidatorSignature = movement.signatures.find((signature) => signature.party === "CEIBAC_VALIDATOR");
  const source = placeLabel(movement.transferLot.sourceSite.nom, movement.transferLot.sourceEntrepot);
  const destination = placeLabel(movement.transferLot.destinationSite.nom, movement.transferLot.destinationEntrepot);
  const movementFrom = movement.type === "RETOUR" ? destination : source;
  const movementTo = movement.type === "RETOUR" ? source : destination;
  const dossierCount = movement.items.reduce((sum, entry) => sum + entry.transferLotItem.dossierCountSnapshot, 0);
  // Conteneur de transport de chaque carton (regroupement par caisse sur le bordereau).
  const caisseOf = await caissesDuMouvement(movement.transferLotId, movement.type, movement.items.map((entry) => entry.transferLotItem));
  const withCaisse = caisseOf.size > 0;
  const items = withCaisse
    ? [...movement.items].sort((a, b) => (caisseOf.get(a.transferLotItem.cartonId ?? 0) ?? "~").localeCompare(caisseOf.get(b.transferLotItem.cartonId ?? 0) ?? "~", "fr", { numeric: true }))
    : movement.items;
  const siteVisaTitle = movement.type === "RECEPTION" ? `Visa du site B · ${destination}` : `Visa du site A · ${source}`;

  return (
    <div className="mx-auto max-w-5xl bg-white print:max-w-none">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/transferts/${lotId}`} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour au lot</Link>
        <div className="flex flex-wrap gap-2"><a href={`/api/transferts/${lotId}/bordereaux/${movementId}`} className={cn(buttonVariants())}><Download /> Télécharger {documentCode}</a><PrintButton /></div>
      </div>

      <article className="border border-slate-300 bg-white [print-color-adjust:exact]">
        <header className="border-b-4 border-[#28519f] p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28519f]">{documentCode} · GeoArchives · Chaîne de garde</p>
              <h1 className="mt-2 text-2xl font-bold">{movement.type === "RECEPTION" ? "Procès-verbal de réception et de déchargement" : "Bon de sortie et bordereau de transfert"}</h1>
              <p className="mt-2 text-sm text-slate-600">{getTransferMovementLabel(movement.type as TransferMovementTypeCode)}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-[#28519f]">{getTransferMovementStatusLabel(movement.status as TransferMovementStatusCode)}</p>
            </div>
            <div className="border border-slate-300 px-4 py-3 text-right">
              <p className="text-xs uppercase text-slate-500">Bordereau</p>
              <p className="mt-1 font-mono text-lg font-bold">{movement.reference}</p>
              <p className="mt-2 text-xs text-slate-500">Lot <span className="font-mono font-semibold text-slate-900">{movement.transferLot.reference}</span></p>
            </div>
          </div>
        </header>

        <section className="grid border-b border-slate-300 sm:grid-cols-3">
          <SlipField label="Date et heure" value={dateTimeFormatter.format(movement.occurredAt)} />
          <SlipField label="Point de départ" value={movementFrom} />
          <SlipField label="Point d'arrivée" value={movementTo} />
        </section>

        <section className="grid border-b border-slate-300 sm:grid-cols-2 lg:grid-cols-4">
          <SlipField label="Itinéraire autorisé" value={movement.transferLot.plannedRoute ?? "Trajet direct entre les sites"} />
          <SlipField label="Véhicule" value={[movement.vehicleDescription, movement.vehicleRegistration].filter(Boolean).join(" · ") || "Non renseigné"} />
          <SlipField label="Chauffeur" value={[movement.driverName, movement.driverPhone].filter(Boolean).join(" · ") || "Non renseigné"} />
          <SlipField label="Convoyeur CEIBA" value={movement.ceibaEscortName ?? "Non renseigné"} />
        </section>

        <section className="p-6 sm:p-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><h2 className="text-lg font-bold">Inventaire remis</h2><p className="mt-1 text-sm text-slate-600">La liste ci-dessous constitue la preuve du mouvement physique enregistré.</p></div>
            <p className="text-sm font-semibold">{dossierCount} dossier{dossierCount > 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-hidden border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100"><tr><th className="border-b border-slate-300 p-3">N°</th>{withCaisse ? <th className="border-b border-slate-300 p-3">Conteneur</th> : null}<th className="border-b border-slate-300 p-3">Code carton</th><th className="border-b border-slate-300 p-3">Libellé</th><th className="border-b border-slate-300 p-3">Dossiers rattachés</th><th className="border-b border-slate-300 p-3 text-center">Volume</th></tr></thead>
              <tbody>
                {items.map((entry, index) => (
                  <tr key={entry.id} className="align-top">
                    <td className="border-b border-slate-200 p-3 tabular-nums">{index + 1}</td>
                    {withCaisse ? <td className="border-b border-slate-200 p-3 font-mono">{caisseOf.get(entry.transferLotItem.cartonId ?? 0) ?? "Hors conteneur"}</td> : null}
                    <td className="border-b border-slate-200 p-3 font-mono font-semibold">{entry.transferLotItem.cartonCode}</td>
                    <td className="border-b border-slate-200 p-3">{entry.transferLotItem.cartonLabel ?? "-"}</td>
                    <td className="border-b border-slate-200 p-3 text-xs leading-5 text-slate-600">{entry.transferLotItem.dossiers.map((link) => link.dossier.reference).join(" · ")}</td>
                    <td className="border-b border-slate-200 p-3 text-center font-semibold tabular-nums">{entry.transferLotItem.dossierCountSnapshot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {movement.conditionStatus ? <div className="mt-5 border border-slate-300 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">État du chargement à l&apos;arrivée</p><p className="mt-2 text-sm font-semibold">{conditionLabel(movement.conditionStatus)}</p></div> : null}
          {movement.sealStatus || movement.sealReferences ? <div className="mt-5 grid gap-4 border border-slate-300 bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-500">État des scellés</p><p className="mt-2 text-sm font-semibold">{movement.sealStatus ? sealStatusLabel(movement.sealStatus) : "Non renseigné"}</p></div><div><p className="text-xs font-semibold uppercase text-slate-500">Références contrôlées</p><p className="mt-2 text-sm">{movement.sealReferences ?? "Aucune"}</p></div></div> : null}
          {movement.observations ? <div className="mt-5 border border-slate-300 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Observations</p><p className="mt-2 whitespace-pre-wrap text-sm">{movement.observations}</p></div> : null}
          {movement.incidentReported || movement.incidentDescription ? <div className="mt-5 border-2 border-amber-500 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase text-amber-900">Constat d&apos;incident ou d&apos;anomalie</p><p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{movement.incidentDescription ?? "Incident signalé sans description complémentaire."}</p></div> : null}
        </section>

        <section className={cn("grid border-t border-slate-300", movement.type === "RECEPTION" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {movement.type === "RECEPTION" ? <SignatureBlock title="Constat de l'agent CEIBA" signature={ceibaSignature} /> : <SignatureBlock title={siteVisaTitle} signature={ministrySignature} />}
          {movement.type === "RECEPTION" ? <SignatureBlock title="Validation interne" signature={ceibaValidatorSignature} /> : <SignatureBlock title="Signature du gestionnaire CEIBA" signature={ceibaSignature} />}
          {movement.type === "RECEPTION" ? <SignatureBlock title={`Visa final du ministère · ${destination}`} signature={ministrySignature} /> : null}
        </section>

        <footer className="flex flex-col gap-2 border-t border-slate-300 bg-slate-50 px-6 py-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#068c78]" /> {movement.status === "VALIDE_MINISTERE" ? "Mouvement validé dans GeoArchives" : "Document en cours de validation"}</span>
          <span>Saisie : {movement.createdBy.name} · {dateTimeFormatter.format(movement.createdAt)}</span>
        </footer>
      </article>
    </div>
  );
}

function conditionLabel(status: "CONFORME" | "AVEC_RESERVES" | "NON_CONFORME") {
  return { CONFORME: "Conforme", AVEC_RESERVES: "Conforme avec réserves", NON_CONFORME: "Non conforme" }[status];
}

function sealStatusLabel(status: "INTACTS" | "ANOMALIE" | "NON_APPLICABLE") {
  return { INTACTS: "Intacts et concordants", ANOMALIE: "Anomalie constatée", NON_APPLICABLE: "Non applicable" }[status];
}

function SlipField({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-slate-300 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}

function placeLabel(site: string, warehouse?: { nom: string; localisation: string | null } | null) {
  return warehouse ? [site, warehouse.nom, warehouse.localisation].filter(Boolean).join(" · ") : site;
}

function SignatureBlock({ title, signature }: { title: string; signature: { signatoryName: string; signatoryTitle: string; signatureData: string; signedAt: Date } | undefined }) {
  return (
    <div className="min-h-64 border-b border-slate-300 p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-sm font-bold">{title}</p>
      {signature ? (
        <>
          <div className="relative mt-4 h-28 w-full border-b border-slate-300">
            <Image src={signature.signatureData} alt={`Signature de ${signature.signatoryName}`} fill unoptimized className="object-contain object-left-bottom" sizes="420px" />
          </div>
          <p className="mt-3 font-semibold">{signature.signatoryName}</p>
          <p className="text-sm text-slate-600">{signature.signatoryTitle}</p>
          <p className="mt-1 text-xs text-slate-500">Signé le {dateTimeFormatter.format(signature.signedAt)}</p>
        </>
      ) : <p className="mt-8 text-sm text-slate-500">Signature non disponible</p>}
    </div>
  );
}
