import type { ReactNode } from "react";
import Link from "next/link";
import { MoveRight } from "lucide-react";
import { TransferLotStatusBadge } from "@/components/transferts/TransferStatusBadge";
import type { TransferLotStatusCode } from "@/lib/utils/transfer-stock";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Bandeau d'un lot pour le terrain : le trajet départ → arrivée d'abord, en
 * gros, puis la quantité et l'action. Pensé pour un téléphone tenu à une main.
 */
export function FieldLotStrip({
  lot,
  highlight,
  children,
}: {
  lot: {
    id: number;
    reference: string;
    status: string;
    plannedAt: Date | null;
    source: string;
    destination: string;
    cartons: number;
    dossiers: number;
    escorts: string[];
  };
  /** Côté du trajet qui concerne la personne (son site, ou la destination du convoi). */
  highlight: "source" | "destination";
  children?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/transferts/${lot.id}`} className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline">{lot.reference}</Link>
        <TransferLotStatusBadge status={lot.status as TransferLotStatusCode} />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <p className={highlight === "source" ? "text-base font-semibold leading-snug" : "text-sm leading-snug text-muted-foreground"}>{lot.source}</p>
        <MoveRight className="size-5 text-[var(--activity-transfer)]" aria-label="vers" />
        <p className={highlight === "destination" ? "text-base font-semibold leading-snug" : "text-sm leading-snug text-muted-foreground"}>{lot.destination}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {lot.cartons} carton{lot.cartons > 1 ? "s" : ""}, {lot.dossiers} dossier{lot.dossiers > 1 ? "s" : ""}
        {lot.plannedAt ? `, prévu le ${dateFormatter.format(lot.plannedAt)}` : ""}
        {lot.escorts.length ? `. Convoyeur : ${lot.escorts.join(", ")}` : ""}
      </p>
      {children ? <div className="mt-4 flex flex-wrap gap-2 [&_button]:min-h-11 [&_a]:min-h-11">{children}</div> : null}
    </article>
  );
}
