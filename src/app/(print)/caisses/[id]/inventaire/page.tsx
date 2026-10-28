import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { getCaisse } from "@/lib/services/caisse-service";
import { cartonQrSvg, getPublicOrigin } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventaire de caisse — GeoArchives" };

/**
 * À coller sur la caisse : son numéro, un QR qui ouvre sa fiche (lié à la
 * caisse, pas à son numéro : il reste valable si la caisse est renumérotée)
 * et la liste de ses cartons par cote.
 */
export default async function CaisseInventairePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAnyPermission("DOSSIER_READ", "CONDITIONNEMENT_VIEW");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const caisse = await getCaisse(id);
  if (!caisse) notFound();
  const qr = await cartonQrSvg(`${await getPublicOrigin()}/caisses/${caisse.id}`);
  const dossiers = caisse.cartons.reduce((sum, carton) => sum + carton.dossiers, 0);
  const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(new Date());

  return (
    <div className="mx-auto max-w-[210mm] text-black">
      <style>{`@page { size: A4 portrait; margin: 10mm; } .qr svg { width: 100%; height: 100%; display: block; }`}</style>
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/caisses/${caisse.id}`} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour à la caisse</Link>
        <PrintButton />
      </div>
      <header className="flex items-center gap-[6mm] border-b-2 border-black pb-[4mm]">
        <div className="qr size-[38mm] shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
        <div>
          <p className="text-[10pt] uppercase tracking-wide">Caisse</p>
          <p className="font-mono text-[30pt] font-bold leading-none">{caisse.numero}</p>
          <p className="mt-[2mm] text-[11pt]">{caisse.site.nom} · {caisse.cartons.length}/{caisse.capacite} cartons · {dossiers} dossiers</p>
          <p className="text-[9pt] text-slate-700">Inventaire du {date}</p>
        </div>
      </header>
      <table className="mt-[4mm] w-full border-collapse text-[10pt]">
        <thead><tr className="border-b border-black text-left"><th className="py-[1.5mm] pr-[3mm]">N°</th><th className="pr-[3mm]">Cote du carton</th><th className="pr-[3mm]">Libellé</th><th className="text-right">Dossiers</th></tr></thead>
        <tbody>
          {caisse.cartons.map((carton, index) => (
            <tr key={carton.id} className="border-b border-slate-300">
              <td className="py-[1.2mm] pr-[3mm] tabular-nums">{index + 1}</td>
              <td className="pr-[3mm] font-mono font-semibold">{carton.cote}</td>
              <td className="pr-[3mm]">{carton.libelle ?? "Sans libellé"}</td>
              <td className="text-right tabular-nums">{carton.dossiers}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {caisse.cartons.length === 0 ? <p className="mt-4 text-sm">Caisse vide.</p> : null}
    </div>
  );
}
