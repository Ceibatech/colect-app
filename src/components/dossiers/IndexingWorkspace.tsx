"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, FolderTree, Loader2, ScanSearch, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DocumentPreindexDialog, type IndexingFieldOption, type PreindexDocument } from "@/components/dossiers/DocumentPreindexDialog";
import type { TypePieceOption } from "@/components/dossiers/TypesPiecesField";

interface IndexingDocument extends PreindexDocument {
  createdAt: string;
}

const STATUS = {
  A_TRAITER: { label: "À analyser", variant: "outline" as const },
  EN_FILE: { label: "En file", variant: "secondary" as const },
  EN_COURS: { label: "Analyse en cours", variant: "secondary" as const },
  DEUXIEME_LECTURE: { label: "Seconde lecture IA", variant: "secondary" as const },
  A_REQUALIFIER: { label: "À requalifier", variant: "destructive" as const },
  INDEXE: { label: "Classé automatiquement", variant: "default" as const },
  ERREUR: { label: "Analyse en erreur", variant: "destructive" as const },
};

export function IndexingWorkspace({
  dossierId,
  documents,
  indexingFields,
  typesPiece,
  canIndex,
}: {
  dossierId: number;
  documents: IndexingDocument[];
  indexingFields: IndexingFieldOption[];
  typesPiece: TypePieceOption[];
  canIndex: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const verified = documents.filter((document) => document.automaticIndexStatus === "INDEXE").length;
  const queued = documents.filter((document) => ["EN_FILE", "EN_COURS", "DEUXIEME_LECTURE"].includes(document.automaticIndexStatus)).length;
  const toReview = documents.filter((document) => document.automaticIndexStatus === "A_REQUALIFIER").length;
  const errors = documents.filter((document) => document.automaticIndexStatus === "ERREUR").length;
  const progress = documents.length > 0 ? Math.round(((verified + toReview) / documents.length) * 100) : 0;

  useEffect(() => {
    if (queued === 0) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [queued, router]);

  function runAutomaticIndexing() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/dossiers/${dossierId}/auto-index`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "L'indexation automatique a échoué.");
        toast.success(`${data.queued} document(s) placé(s) en file${data.alreadyQueued ? `, ${data.alreadyQueued} déjà en cours` : ""}.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "L'indexation automatique a échoué.");
      }
    });
  }

  return (
    <section className="space-y-4 rounded-lg border bg-muted/15 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Service d&apos;indexation documentaire</h3>
            <Badge variant="outline">{indexingFields.length} champs configurés</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            OCR, LAD et IA extraient les métadonnées, appliquent les règles métier et classent automatiquement les résultats fiables. Seuls les cas ambigus restent à requalifier.
          </p>
        </div>
        {canIndex ? (
          <Button onClick={runAutomaticIndexing} disabled={isPending || documents.length === 0}>
            {isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            {documents.some((document) => document.automaticIndexStatus !== "A_TRAITER") ? "Relancer l'analyse" : "Lancer l'analyse"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Documents" value={documents.length} />
        <Metric label="En traitement" value={queued} tone={queued > 0 ? "warning" : undefined} />
        <Metric label="Classés automatiquement" value={verified} tone="success" />
        <Metric label="À requalifier" value={toReview} tone={toReview > 0 ? "warning" : undefined} />
        <Metric label="Erreurs" value={errors} tone={errors > 0 ? "danger" : undefined} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Traitement terminé</span><span>{progress} %</span>
        </div>
        <Progress value={progress} />
      </div>

      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ajoutez d&apos;abord les fichiers numérisés dans l&apos;onglet Documents.
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-md border bg-background">
          {documents.map((document) => {
            const status = STATUS[document.automaticIndexStatus];
            return (
              <article key={document.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{document.titreIndexation ?? document.nomOriginal}</p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {document.indexingConfidence !== null ? (
                      <Badge variant="outline">Confiance {Math.round(document.indexingConfidence)} %</Badge>
                    ) : null}
                  </div>
                  {document.classificationPath ? (
                    <p className="mt-2 flex items-start gap-1.5 break-all text-xs text-muted-foreground">
                      <FolderTree className="mt-0.5 h-3.5 w-3.5 shrink-0" />{document.classificationPath}
                    </p>
                  ) : null}
                  {document.lastIndexingError ? (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{document.lastIndexingError}
                    </p>
                  ) : null}
                  {document.automaticIndexStatus === "INDEXE" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Métadonnées validées automatiquement par les règles GeoArchives.</p>
                  ) : document.automaticIndexStatus === "A_REQUALIFIER" ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><TriangleAlert className="h-3.5 w-3.5" />Le document reste recherchable ; aucune valeur incertaine n&apos;a été injectée dans les champs officiels.</p>
                  ) : null}
                </div>
                {canIndex && !["EN_FILE", "EN_COURS", "DEUXIEME_LECTURE"].includes(document.automaticIndexStatus) ? (
                  <DocumentPreindexDialog document={document} typesPiece={typesPiece} indexingFields={indexingFields} />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" }) {
  const color = tone === "success" ? "text-brand-green" : tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
