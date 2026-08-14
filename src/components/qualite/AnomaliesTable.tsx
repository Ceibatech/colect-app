"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
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
      <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        Aucune anomalie ouverte. Lancez un contrôle qualité pour analyser les dossiers.
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
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/dossiers/${a.dossier.id}`} className="font-mono text-xs underline underline-offset-2">
                  {a.dossier.reference}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">{TYPE_LABELS[a.type] ?? a.type}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{a.champ ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={GRAVITE_VARIANT[a.gravite] ?? "outline"}>{a.gravite}</Badge>
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
