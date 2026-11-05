import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { cartonQrSvg, cartonScanUrl, getCartonSheet, getPublicOrigin } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";
import { LabelFormatBar } from "@/components/cartons/LabelFormatBar";
import { reperesDossier, rollSize } from "@/lib/cartons/zebra-labels";

export const metadata = { title: "Étiquettes des dossiers — GeoArchives" };

/**
 * Planche A4 des étiquettes des dossiers d'un carton : 24 par page (3 × 8),
 * QR code et cote (2010-KOU-0001-012) à coller sur chaque chemise. Le QR
 * ouvre la fiche du carton.
 */
export default async function DossierLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAnyPermission("DOSSIER_READ", "TRANSFER_VIEW");
  const params = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const raw = params.carton;
  const id = Number(one(raw));
  // Rouleau (?format=rouleau) : une étiquette par page, 60 × 30 mm par défaut, imprimante Zebra.
  const rouleau = one(params.format) === "rouleau";
  const size = rollSize("dossier", one(params.l), one(params.h));
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
    <div className={rouleau ? "mx-auto" : "mx-auto max-w-[210mm]"} style={rouleau ? { maxWidth: `${size.largeur}mm` } : undefined}>
      <style>{rouleau ? `
        @page { size: ${size.largeur}mm ${size.hauteur}mm; margin: 0; }
        .label-sheet { display: flex; flex-direction: column; gap: 3mm; }
        .dossier-label { width: ${size.largeur}mm; height: ${size.hauteur}mm; padding: 2mm !important; border-radius: 0 !important; gap: 2mm !important; }
        .dossier-label .qr { width: ${size.hauteur - 4}mm !important; height: ${size.hauteur - 4}mm !important; }
        .dossier-label .cote { font-size: ${Math.min(8, Math.max(5.5, Math.round(((size.largeur - size.hauteur - 2) / 4.4) * 10) / 10))}pt !important; }
        .dossier-label svg { width: 100%; height: 100%; display: block; }
        @media print { .label-sheet { gap: 0; } .dossier-label { border: none !important; break-after: page; page-break-after: always; } .dossier-label:last-child { break-after: auto; page-break-after: auto; } }
      ` : `
        @page { size: A4 portrait; margin: 8mm; }
        .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; }
        .dossier-label { height: 33mm; break-inside: avoid; page-break-inside: avoid; }
        .dossier-label svg { width: 100%; height: 100%; display: block; }
      `}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={carton ? `/cartons/${carton.reference}` : "/cartons"} className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour au carton</Link>
        <p className="text-sm text-slate-600">
          {carton ? <>Carton <span className="font-mono font-semibold">{carton.reference}</span> : </> : null}
          {labels.length} étiquette{labels.length > 1 ? "s" : ""}{rouleau ? ` sur rouleau ${size.largeur} × ${size.hauteur} mm.` : `, ${Math.max(1, Math.ceil(labels.length / 24))} page${labels.length > 24 ? "s" : ""} A4.`}
        </p>
        <PrintButton />
      </div>
      {carton ? (
        <div className="mb-5 print:hidden">
          <LabelFormatBar basePath="/cartons/etiquettes-dossiers" query={{ carton: String(carton.id) }} rouleau={rouleau} size={size} zplHref={`/api/cartons/etiquettes/zpl?type=dossiers&carton=${carton.id}&l=${size.largeur}&h=${size.hauteur}`} />
          {rouleau ? <p className="mt-2 text-xs text-slate-600">Dans la fenêtre d&apos;impression : imprimante Zebra, format {size.largeur} × {size.hauteur} mm, marges « aucune », échelle 100 %.</p> : null}
        </div>
      ) : null}
      {labels.length === 0 ? <p className="text-sm text-slate-600">Aucun dossier à étiqueter.</p> : null}
      <div className="label-sheet">
        {labels.map((label) => (
          <article key={label.id} className="dossier-label flex items-center gap-[2.5mm] overflow-hidden rounded-[1.5mm] border border-slate-400 p-[2.5mm] text-black">
            <div className="qr size-[26mm] shrink-0" dangerouslySetInnerHTML={{ __html: label.qr }} />
            <div className="min-w-0 flex-1">
              <p className="cote whitespace-nowrap font-mono text-[7.6pt] font-bold leading-tight tracking-tight">{label.code}</p>
              {/* Rang seul : il ne change jamais, alors qu'un total deviendrait faux au premier ajout. */}
              {label.rangCarton ? <p className="text-[8pt] text-slate-700">Dossier n° {label.rangCarton}</p> : null}
              {/* Aucun nom sur l'étiquette : le titulaire ne se voit qu'au scan, après connexion.
                  Repères de collage : îlot, lot et titre foncier, tels qu'écrits sur la chemise. */}
              <p className="mt-[1mm] line-clamp-2 text-[8pt] font-semibold leading-snug">
                {reperesDossier(label)}
              </p>
              <p className="text-[7pt] text-slate-600">{label.reference}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
