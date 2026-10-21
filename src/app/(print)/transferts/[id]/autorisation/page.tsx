import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { getTransferAuthorization } from "@/lib/services/transfer-service";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

export const metadata = { title: "Autorisation de transfert - GeoArchives-MULCV" };

export default async function TransferAuthorizationPage({ params }: { params: Promise<{ id: string }> }) {
  const lotId = Number((await params).id);
  if (!Number.isInteger(lotId) || lotId <= 0) notFound();
  const lot = await getTransferAuthorization(lotId);
  if (!lot || !lot.authorizedAt || !lot.approvalSignatureData) notFound();
  const source = placeLabel(lot.sourceSite.nom, lot.sourceEntrepot?.nom);
  const destination = placeLabel(lot.destinationSite.nom, lot.destinationEntrepot?.nom);
  const dossierCount = lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0);

  return (
    <div className="mx-auto max-w-5xl bg-white print:max-w-none">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href={`/transferts/${lot.id}`} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour au lot</Link><PrintButton /></div>
      <article className="border border-slate-300 bg-white [print-color-adjust:exact]">
        <header className="border-b-4 border-[#28519f] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#28519f]">GeoArchives-MULCV · Chaîne de garde</p>
          <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h1 className="text-2xl font-bold">Autorisation de sortie et de transfert</h1><p className="mt-2 text-sm text-slate-600">Bordereau contractuel partagé entre le ministère et CEIBAC.</p></div><div className="border border-slate-300 px-4 py-3 text-right"><p className="text-xs uppercase text-slate-500">Lot autorisé</p><p className="mt-1 font-mono text-lg font-bold">{lot.reference}</p></div></div>
        </header>
        <section className="grid border-b border-slate-300 sm:grid-cols-3"><SlipField label="Autorisé le" value={dateTimeFormatter.format(lot.authorizedAt)} /><SlipField label="Site de départ" value={source} /><SlipField label="Destination" value={destination} /></section>
        <section className="p-6 sm:p-8">
          <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-lg font-bold">Composition autorisée</h2><p className="mt-1 text-sm text-slate-600">Seuls les dossiers ci-dessous peuvent quitter le site d&apos;origine sous cette référence.</p></div><p className="text-sm font-semibold">{dossierCount} dossier{dossierCount > 1 ? "s" : ""}</p></div>
          <div className="overflow-hidden border border-slate-300"><table className="w-full border-collapse text-left text-sm"><thead className="bg-slate-100"><tr><th className="border-b p-3">N°</th><th className="border-b p-3">Carton</th><th className="border-b p-3">Libellé</th><th className="border-b p-3">Dossiers</th><th className="border-b p-3 text-center">Volume</th></tr></thead><tbody>{lot.items.map((item, index) => <tr key={item.id} className="align-top"><td className="border-b p-3">{index + 1}</td><td className="border-b p-3 font-mono font-semibold">{item.cartonCode}</td><td className="border-b p-3">{item.cartonLabel ?? "-"}</td><td className="border-b p-3 text-xs text-slate-600">{item.dossiers.map((entry) => entry.dossier.reference).join(" · ")}</td><td className="border-b p-3 text-center font-semibold">{item.dossierCountSnapshot}</td></tr>)}</tbody></table></div>
          {lot.motif ? <div className="mt-5 border bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Objet du transfert</p><p className="mt-2 whitespace-pre-wrap text-sm">{lot.motif}</p></div> : null}
        </section>
        <section className="grid border-t border-slate-300 sm:grid-cols-2">
          <div className="min-h-64 border-b border-slate-300 p-6 sm:border-b-0 sm:border-r"><p className="text-sm font-bold">Visa du responsable ministère</p><div className="relative mt-4 h-28 w-full border-b"><Image src={lot.approvalSignatureData} alt={`Signature de ${lot.approvalSignatoryName ?? "responsable ministère"}`} fill unoptimized className="object-contain object-left-bottom" sizes="420px" /></div><p className="mt-3 font-semibold">{lot.approvalSignatoryName}</p><p className="text-sm text-slate-600">{lot.approvalSignatoryTitle}</p><p className="mt-1 text-xs text-slate-500">Signé le {dateTimeFormatter.format(lot.authorizedAt)}</p></div>
          <div className="min-h-64 p-6"><p className="text-sm font-bold">Contrôle CEIBAC à la sortie</p><p className="mt-8 text-sm leading-6 text-slate-600">Le gestionnaire CEIBAC présente ce bordereau au contrôle du site. Le mouvement effectif de sortie fera l&apos;objet d&apos;un bordereau signé distinct dans GeoArchives.</p></div>
        </section>
        <footer className="flex flex-col gap-2 border-t bg-slate-50 px-6 py-4 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#068c78]" /> Autorisation enregistrée et traçable</span><span>Créé par {lot.createdBy.name} · visa système {lot.authorizedBy?.name ?? "-"}</span></footer>
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
