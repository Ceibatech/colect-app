import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JournalEntry } from "@/lib/services/transfer-journal-service";
import { cn } from "@/lib/utils";

const when = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium", timeZone: "Africa/Abidjan" });
const DOT: Record<JournalEntry["kind"], string> = {
  circuit: "bg-primary",
  document: "bg-brand-gold",
  terrain: "bg-muted-foreground",
  trajet: "bg-brand-green",
};

/** Journal horodaté du lot : chaque action, son heure exacte et son auteur. */
export function LotJournal({ entries }: { entries: JournalEntry[] }) {
  return (
    <Card className="bg-card/95">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" aria-hidden /> Journal du lot</CardTitle>
        <CardDescription>Toutes les actions dans l&apos;ordre, à la seconde près (heure d&apos;Abidjan) : circuit de validation, bordereaux, chargement, trajet, arrivée et déchargement.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Aucune action enregistrée.</p> : (
          <ol className="divide-y divide-border/60">
            {entries.map((entry, index) => (
              <li key={`${entry.at.toISOString()}-${index}`} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_12rem] sm:gap-4">
                <span className="tabular-nums text-muted-foreground">{when.format(entry.at)}</span>
                <span className="flex min-w-0 items-start gap-2">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[entry.kind])} aria-hidden />
                  <span className="min-w-0"><span className="font-medium">{entry.label}</span>{entry.detail ? <span className="block text-xs text-muted-foreground">{entry.detail}</span> : null}</span>
                </span>
                <span className="text-muted-foreground sm:text-right">{entry.by ?? ""}</span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
