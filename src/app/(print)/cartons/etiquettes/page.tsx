import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/transferts/PrintButton";
import { buttonVariants } from "@/components/ui/button";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { cartonQrSvg, cartonScanUrl, getLabelCartons, getPublicOrigin, LABEL_PRINT_LIMIT } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Étiquettes QR des cartons — GeoArchives" };

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

/**
 * Planche A4 d'étiquettes : 8 par page (2 × 4, environ 95 × 66 mm), QR code de
 * 40 mm, cote du référentiel (2010-KOU-0001) et libellé en clair pour une lecture sans téléphone.
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
  const origin = await getPublicOrigin();
  const labels = await Promise.all(rows.map(async (row) => ({ ...row, qr: await cartonQrSvg(cartonScanUrl(origin, row.reference)) })));

  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        .label-sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; }
        .carton-label { height: 66mm; break-inside: avoid; page-break-inside: avoid; }
        .carton-label svg { width: 100%; height: 100%; display: block; }
      `}</style>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/cartons" className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Retour aux cartons</Link>
        <p className="text-sm text-slate-600">
          {labels.length} étiquette{labels.length > 1 ? "s" : ""}, {Math.ceil(labels.length / 8)} page{labels.length > 8 ? "s" : ""} A4
          {truncated ? `. Limité aux ${LABEL_PRINT_LIMIT} premières : filtrez par site ou salle pour la suite.` : "."}
        </p>
        <PrintButton />
      </div>
      {labels.length === 0 ? <p className="text-sm text-slate-600">Aucun carton à étiqueter pour ce filtre.</p> : null}
      <div className="label-sheet">
        {labels.map((label) => (
          <article key={label.id} className="carton-label flex gap-[4mm] overflow-hidden rounded-[2mm] border border-slate-400 p-[4mm] text-black">
            <div className="size-[40mm] shrink-0" dangerouslySetInnerHTML={{ __html: label.qr }} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="font-mono text-[16pt] font-bold leading-tight">{label.reference}</p>
              <p className="mt-[3mm] line-clamp-3 text-[14pt] font-semibold leading-snug">{label.label ?? "Sans libellé"}</p>
              <p className="mt-auto text-[8.5pt] leading-snug text-slate-700">{[label.site, label.salle].filter(Boolean).join(" · ")}</p>
              <p className="text-[8.5pt] text-slate-700">{label.dossiers} dossier{label.dossiers > 1 ? "s" : ""} · GeoArchives CEIBA</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
