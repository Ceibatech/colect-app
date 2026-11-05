import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { cartonQrSvg, cartonScanUrl, getLabelCartons, getPublicOrigin, LABEL_PRINT_LIMIT } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";
import { LabelFormatBar } from "@/components/cartons/LabelFormatBar";
import { rollSize } from "@/lib/cartons/zebra-labels";

export const metadata = { title: "Étiquettes QR des cartons — GeoArchives" };

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

/**
 * Étiquettes des cartons. Planche A4 : 8 par page (2 × 4, environ 95 × 66 mm),
 * QR de 40 mm. Rouleau (?format=rouleau) : une étiquette par page au format du
 * rouleau (100 × 50 mm par défaut), pour imprimante thermique Zebra ; le
 * fichier ZPL natif est proposé à côté.
 */
export default async function CartonLabelsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAnyPermission("DOSSIER_READ", "TRANSFER_VIEW");
  const params = await searchParams;
  const ids = (single(params.ids) ?? "").split(",").map((value) => positiveInt(value.trim())).filter((value): value is number => value !== undefined);
  const { rows, truncated } = await getLabelCartons({
    ids,
    q: single(params.q)?.trim().slice(0, 200) || undefined,
    siteId: positiveInt(single(params.site)),
    entrepotId: positiveInt(single(params.salle)),
  });
  const rouleau = single(params.format) === "rouleau";
  const size = rollSize("carton", single(params.l), single(params.h));
  const query = { ids: single(params.ids), q: single(params.q), site: single(params.site), salle: single(params.salle) };
  const zplParams = new URLSearchParams(Object.entries({ ...query, l: String(size.largeur), h: String(size.hauteur) }).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const origin = await getPublicOrigin();
  const labels = await Promise.all(rows.map(async (row) => ({ ...row, qr: await cartonQrSvg(cartonScanUrl(origin, row.reference)) })));

  return (
    <div className={rouleau ? "mx-auto" : "mx-auto max-w-[210mm]"} style={rouleau ? { maxWidth: `${size.largeur}mm` } : undefined}>
      <style>{rouleau ? `
        @page { size: ${size.largeur}mm ${size.hauteur}mm; margin: 0; }
        .label-sheet { display: flex; flex-direction: column; gap: 4mm; }
        .carton-label { width: ${size.largeur}mm; height: ${size.hauteur}mm; padding: 3mm !important; border-radius: 0 !important; gap: 3mm !important; }
        .carton-label .qr { width: ${size.hauteur - 6}mm !important; height: ${size.hauteur - 6}mm !important; }
        .carton-label .cote { font-size: ${Math.min(13, Math.max(8, Math.round((size.largeur - size.hauteur - 6) / 4.2)))}pt !important; }
        .carton-label .libelle { font-size: 10pt !important; margin-top: 1.5mm !important; }
        .carton-label .pied { font-size: 7pt !important; }
        .carton-label svg { width: 100%; height: 100%; display: block; }
        @media print { .label-sheet { gap: 0; } .carton-label { border: none !important; break-after: page; page-break-after: always; } .carton-label:last-child { break-after: auto; page-break-after: auto; } }
      ` : `
        @page { size: A4 portrait; margin: 8mm; }
        .label-sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; }
        .carton-label { height: 66mm; break-inside: avoid; page-break-inside: avoid; }
        .carton-label svg { width: 100%; height: 100%; display: block; }
      `}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/cartons" className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour aux cartons</Link>
        <p className="text-sm text-slate-600">
          {labels.length} étiquette{labels.length > 1 ? "s" : ""}{rouleau ? ` sur rouleau ${size.largeur} × ${size.hauteur} mm` : `, ${Math.ceil(labels.length / 8)} page${labels.length > 8 ? "s" : ""} A4`}
          {truncated ? `. Limité aux ${LABEL_PRINT_LIMIT} premières : filtrez par site ou salle pour la suite.` : "."}
        </p>
        <PrintButton />
      </div>
      <div className="mb-5 print:hidden">
        <LabelFormatBar basePath="/cartons/etiquettes" query={query} rouleau={rouleau} size={size} zplHref={`/api/cartons/etiquettes/zpl?${zplParams.toString()}`} />
        {rouleau ? <p className="mt-2 text-xs text-slate-600">Dans la fenêtre d&apos;impression : imprimante Zebra, format {size.largeur} × {size.hauteur} mm, marges « aucune », échelle 100 %. Autre rouleau : ajoutez &l=…&h=… (mm) à l&apos;adresse.</p> : null}
      </div>
      {labels.length === 0 ? <p className="text-sm text-slate-600">Aucun carton à étiqueter pour ce filtre.</p> : null}
      <div className="label-sheet">
        {labels.map((label) => (
          <article key={label.id} className="carton-label flex gap-[4mm] overflow-hidden rounded-[2mm] border border-slate-400 p-[4mm] text-black">
            <div className="qr size-[40mm] shrink-0" dangerouslySetInnerHTML={{ __html: label.qr }} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="cote whitespace-nowrap font-mono text-[13pt] font-bold leading-tight tracking-tight">{label.reference}</p>
              <p className="libelle mt-[3mm] line-clamp-3 text-[14pt] font-semibold leading-snug">{label.label ?? "Sans libellé"}</p>
              <p className="pied mt-auto text-[8.5pt] leading-snug text-slate-700">{[label.site, label.salle].filter(Boolean).join(" · ")}</p>
              {/* Pas de nombre de dossiers : il change dès qu'un dossier s'ajoute au carton. */}
              <p className="pied text-[8.5pt] text-slate-700">GeoArchives CEIBA</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
