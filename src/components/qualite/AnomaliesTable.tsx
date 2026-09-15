"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveAnomalie } from "@/lib/services/quality-service";
import type { OpenAnomalyRow } from "@/lib/services/quality-service";

const GRAVITE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITIQUE: "destructive",
  ELEVEE: "destructive",
  MOYENNE: "secondary",
  FAIBLE: "outline",
};

const GRAVITE_LABELS: Record<string, string> = {
  CRITIQUE: "Critique",
  ELEVEE: "Élevée",
  MOYENNE: "Moyenne",
  FAIBLE: "Faible",
};

const TYPE_LABELS: Record<string, string> = {
  CHAMP_MANQUANT: "Information manquante",
  DOUBLON: "Doublon à vérifier",
  FORMAT_INVALIDE: "Format non conforme",
  INCOHERENCE: "Incohérence détectée",
  ERREUR_SAISIE: "Erreur de saisie",
  DOCUMENT_MANQUANT: "Document manquant",
  AUTRE: "Autre contrôle",
};

export function AnomaliesTable({ anomalies, canResolve }: { anomalies: OpenAnomalyRow[]; canResolve: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (anomalies.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
          <ClipboardCheck className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Portefeuille à jour</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">Aucune anomalie ne nécessite une intervention.</p>
      </div>
    );
  }

  function resolve(id: number) {
    startTransition(async () => {
      try {
        await resolveAnomalie(id);
        toast.success("Anomalie marquée comme corrigée.");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Impossible de clôturer cette anomalie.");
      }
    });
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="bg-muted/45 hover:bg-muted/45">
              <TableHead className="pl-4">Dossier</TableHead>
              <TableHead>Point de contrôle</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead className="min-w-72">Détail</TableHead>
              <TableHead>Détectée le</TableHead>
              {canResolve ? <TableHead className="pr-4 text-right">Traitement</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {anomalies.map((anomaly) => (
              <TableRow key={anomaly.id} className="hover:bg-accent/25">
                <TableCell className="pl-4">
                  <Link href={`/dossiers/${anomaly.dossier.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                    {anomaly.dossier.reference}
                  </Link>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{TYPE_LABELS[anomaly.type] ?? anomaly.type}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{anomaly.champ ?? "Contrôle général"}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={GRAVITE_VARIANT[anomaly.gravite] ?? "outline"} className="rounded-md">
                    {GRAVITE_LABELS[anomaly.gravite] ?? anomaly.gravite}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md whitespace-normal text-sm leading-5 text-muted-foreground">{anomaly.description ?? "Aucun détail complémentaire."}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(anomaly.createdAt)}</TableCell>
                {canResolve ? (
                  <TableCell className="pr-4 text-right">
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => resolve(anomaly.id)}>
                      {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                      Marquer corrigée
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-border/60 lg:hidden">
        {anomalies.map((anomaly) => (
          <article key={anomaly.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dossiers/${anomaly.dossier.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {anomaly.dossier.reference}
                </Link>
                <p className="mt-1 text-sm font-medium">{TYPE_LABELS[anomaly.type] ?? anomaly.type}</p>
              </div>
              <Badge variant={GRAVITE_VARIANT[anomaly.gravite] ?? "outline"} className="rounded-md">
                {GRAVITE_LABELS[anomaly.gravite] ?? anomaly.gravite}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{anomaly.champ ?? "Contrôle général"}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{anomaly.description ?? "Aucun détail complémentaire."}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(anomaly.createdAt)}
              </span>
              {canResolve ? (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => resolve(anomaly.id)}>
                  {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                  Marquer corrigée
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}