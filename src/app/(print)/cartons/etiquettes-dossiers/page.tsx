import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { cartonQrSvg, cartonScanUrl, getCartonSheet, getPublicOrigin } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Étiquettes des dossiers — GeoArchives" };

/**
 * Planche A4 des étiquettes des dossiers d'un carton : 24 par page (3 × 8),
 * QR code et cote (2010-KOU-0001-012) à coller sur chaque chemise. Le QR
 * ouvre la fiche du carton.
 */
export default async function DossierLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAnyPermission("DOSSIER_READ", "TRANSFER_VIEW");
  const raw = (await searchParams).carton;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  const carton = Number.isInteger(id) && id > 0 ? await getCartonSheet(id) : null;
  const origin = await getPublicOrigin();
  const labels = carton
    ? await Promise.all(carton.dossiers.map(async (dossier) => ({
        ...dossier,
        code: dossier.cote ?? dossier.reference,
        qr: await cartonQrSvg(cartonScanUrl(origin, dossier.cote ?? carton.reference)),
      })))
    : [];

  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
        .dossier-label { height: 33mm; break-inside: avoid; page-break-inside: avoid; }
        .dossier-label svg { width: 100%; height: 100%; display: block; }
      `}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={carton ? `/cartons/${carton.reference}` : "/cartons"} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour au carton</Link>
        <p className="text-sm text-slate-600">
          {carton ? <>Carton <span className="font-mono font-semibold">{carton.reference}</span> : </> : null}
          {labels.length} étiquette{labels.length > 1 ? "s" : ""}, {Math.max(1, Math.ceil(labels.length / 24))} page{labels.length > 24 ? "s" : ""} A4.
        </p>
        <PrintButton />
      </div>
      {labels.length === 0 ? <p className="text-sm text-slate-600">Aucun dossier à étiqueter.</p> : null}
      <div className="label-sheet">
        {labels.map((label) => (
          <article key={label.id} className="dossier-label flex items-center gap-[2.5mm] overflow-hidden rounded-[1.5mm] border border-slate-400 p-[2.5mm] text-black">
            <div className="size-[26mm] shrink-0" dangerouslySetInnerHTML={{ __html: label.qr }} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[9.5pt] font-bold leading-tight">{label.code}</p>
              {label.rangCarton ? <p className="text-[8pt] text-slate-700">Dossier n° {label.rangCarton}/{labels.length}</p> : null}
              <p className="mt-[1mm] line-clamp-2 text-[8.5pt] font-semibold leading-snug">{[label.nom, label.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}</p>
              <p className="text-[7pt] text-slate-600">{label.reference}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
