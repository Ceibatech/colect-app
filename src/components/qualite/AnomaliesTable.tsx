"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveAnomalie } from "@/lib/services/quality-service";
import type { OpenAnomalyRow } from "@/lib/services/quality-service";

const GRAVITE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITIQUE: "destructive",
  ELEVEE: "destructive",
  MOYENNE: "secondary",
  FAIBLE: "outline",
};

const TYPE_LABELS: Record<string, string> = {
  CHAMP_MANQUANT: "Champ manquant",
  DOUBLON: "Doublon",
  FORMAT_INVALIDE: "Format invalide",
  INCOHERENCE: "Incohérence",
  ERREUR_SAISIE: "Erreur de saisie",
  DOCUMENT_MANQUANT: "Document manquant",
  AUTRE: "Autre",
};

export function AnomaliesTable({ anomalies, canResolve }: { anomalies: OpenAnomalyRow[]; canResolve: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (anomalies.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background/70 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green">
          <ClipboardCheck className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Aucune anomalie ouverte</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
          Lancez un contrôle qualité pour analyser les dossiers et faire remonter les points à corriger.
        </p>
      </div>
    );
  }

  function resolve(id: number) {
    startTransition(async () => {
      try {
        await resolveAnomalie(id);
        toast.success("Anomalie marquée corrigée.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la résolution.");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Dossier</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Champ</TableHead>
            <TableHead>Gravité</TableHead>
            <TableHead>Description</TableHead>
            {canResolve && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {anomalies.map((a) => (
            <TableRow key={a.id} className="hover:bg-accent/30">
              <TableCell className="whitespace-nowrap">
                <Link href={`/dossiers/${a.dossier.id}`} className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline">
                  {a.dossier.reference}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium">{TYPE_LABELS[a.type] ?? a.type}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{a.champ ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={GRAVITE_VARIANT[a.gravite] ?? "outline"} className="rounded-md">
                  {a.gravite}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground" title={a.description ?? undefined}>
                {a.description ?? "—"}
              </TableCell>
              {canResolve && (
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => resolve(a.id)}>
                    {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                    Corrigée
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}