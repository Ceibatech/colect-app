import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { getTransferBordereau } from "@/lib/services/transfer-service";
import { getTransferMovementLabel, type TransferMovementTypeCode } from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

export const metadata = { title: "Bordereau de transfert - GeoArchives-MULCV" };

export default async function TransferSlipPage({ params }: { params: Promise<{ id: string; movementId: string }> }) {
  const { id: idParam, movementId: movementIdParam } = await params;
  const lotId = Number(idParam);
  const movementId = Number(movementIdParam);
  if (!Number.isInteger(lotId) || !Number.isInteger(movementId) || lotId <= 0 || movementId <= 0) notFound();

  const movement = await getTransferBordereau(lotId, movementId);
  if (!movement) notFound();
  const ministrySignature = movement.signatures.find((signature) => signature.party === "MINISTERE");
  const ceibacSignature = movement.signatures.find((signature) => signature.party === "CEIBAC");
  const source = placeLabel(movement.transferLot.sourceSite.nom, movement.transferLot.sourceEntrepot?.nom);
  const destination = placeLabel(movement.transferLot.destinationSite.nom, movement.transferLot.destinationEntrepot?.nom);
  const movementFrom = movement.type === "RETOUR" ? destination : source;
  const movementTo = movement.type === "RETOUR" ? source : destination;

  return (
    <div className="mx-auto max-w-5xl bg-white print:max-w-none">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/transferts/${lotId}`} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour au lot</Link>
        <PrintButton />
      </div>

      <article className="border border-slate-300 bg-white [print-color-adjust:exact]">
        <header className="border-b-4 border-[#28519f] p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28519f]">GeoArchives-MULCV · Chaîne de garde</p>
              <h1 className="mt-2 text-2xl font-bold">Bordereau de transfert d&apos;archives</h1>
              <p className="mt-2 text-sm text-slate-600">{getTransferMovementLabel(movement.type as TransferMovementTypeCode)}</p>
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

        <section className="p-6 sm:p-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><h2 className="text-lg font-bold">Inventaire remis</h2><p className="mt-1 text-sm text-slate-600">La liste ci-dessous constitue la preuve du mouvement physique enregistré.</p></div>
            <p className="text-sm font-semibold">{movement.items.length} carton{movement.items.length > 1 ? "s" : ""}</p>
          </div>
          <div className="overflow-hidden border border-slate-300">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100"><tr><th className="border-b border-slate-300 p-3">N°</th><th className="border-b border-slate-300 p-3">Code carton</th><th className="border-b border-slate-300 p-3">Libellé</th><th className="border-b border-slate-300 p-3">Dossiers rattachés</th><th className="border-b border-slate-300 p-3 text-center">Volume</th></tr></thead>
              <tbody>
                {movement.items.map((entry, index) => (
                  <tr key={entry.id} className="align-top">
                    <td className="border-b border-slate-200 p-3 tabular-nums">{index + 1}</td>
                    <td className="border-b border-slate-200 p-3 font-mono font-semibold">{entry.transferLotItem.cartonCode}</td>
                    <td className="border-b border-slate-200 p-3">{entry.transferLotItem.cartonLabel ?? "-"}</td>
                    <td className="border-b border-slate-200 p-3 text-xs leading-5 text-slate-600">{entry.transferLotItem.dossiers.map((link) => link.dossier.reference).join(" · ")}</td>
                    <td className="border-b border-slate-200 p-3 text-center font-semibold tabular-nums">{entry.transferLotItem.dossierCountSnapshot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {movement.observations ? <div className="mt-5 border border-slate-300 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Observations</p><p className="mt-2 whitespace-pre-wrap text-sm">{movement.observations}</p></div> : null}
        </section>

        <section className="grid border-t border-slate-300 sm:grid-cols-2">
          <SignatureBlock title="Visa Ministère" signature={ministrySignature} />
          <SignatureBlock title="Visa CEIBAC" signature={ceibacSignature} />
        </section>

        <footer className="flex flex-col gap-2 border-t border-slate-300 bg-slate-50 px-6 py-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-[#068c78]" /> Mouvement enregistré dans GeoArchives-MULCV</span>
          <span>Saisie : {movement.createdBy.name} · {dateTimeFormatter.format(movement.createdAt)}</span>
        </footer>
      </article>
    </div>
  );
}

function SlipField({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-slate-300 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>;
}

function placeLabel(site: string, warehouse?: string | null) {
  return warehouse ? `${site} · ${warehouse}` : site;
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
