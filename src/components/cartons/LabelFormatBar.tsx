import Link from "next/link";
import { FileCode2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RollSize } from "@/lib/cartons/zebra-labels";

/**
 * Choix du support d'impression : planche A4 (imprimante de bureau) ou rouleau
 * d'étiquettes (imprimante thermique Zebra), plus le fichier ZPL natif.
 */
export function LabelFormatBar({ basePath, query, rouleau, size, zplHref }: {
  basePath: string;
  query: Record<string, string | undefined>;
  rouleau: boolean;
  size: RollSize;
  zplHref: string;
}) {
  const href = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...extra })) if (value) params.set(key, value);
    return `${basePath}?${params.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-sm text-slate-600">Support :</span>
      <Link href={href({ format: undefined, l: undefined, h: undefined })} className={cn(buttonVariants({ variant: rouleau ? "outline" : "default", size: "sm" }))}>Planche A4</Link>
      <Link href={href({ format: "rouleau", l: String(size.largeur), h: String(size.hauteur) })} className={cn(buttonVariants({ variant: rouleau ? "default" : "outline", size: "sm" }))}>
        Rouleau Zebra {size.largeur} × {size.hauteur} mm
      </Link>
      <a href={zplHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))} download><FileCode2 /> Fichier ZPL</a>
    </div>
  );
}
