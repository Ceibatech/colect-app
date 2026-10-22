"use client";

import { useTransition } from "react";
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
  EN_COURS: { label: "Analyse en cours", variant: "secondary" as const },
  A_VERIFIER: { label: "À vérifier", variant: "secondary" as const },
  INDEXE: { label: "Index validé", variant: "default" as const },
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
  const toReview = documents.filter((document) => document.automaticIndexStatus === "A_VERIFIER").length;
  const errors = documents.filter((document) => document.automaticIndexStatus === "ERREUR").length;
  const progress = documents.length > 0 ? Math.round((verified / documents.length) * 100) : 0;

  function runAutomaticIndexing() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/dossiers/${dossierId}/auto-index`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "L'indexation automatique a échoué.");
        if (data.failed > 0) {
          toast.warning(`${data.succeeded} document(s) analysé(s), ${data.failed} en erreur. Consultez le détail ci-dessous.`);
        } else {
          toast.success(`${data.succeeded} document(s) analysé(s). Vérifiez maintenant les champs proposés.`);
        }
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
            Le moteur lit les scans, propose les métadonnées et prépare leur classement. Un agent contrôle chaque proposition avant validation.
          </p>
        </div>
        {canIndex ? (
          <Button onClick={runAutomaticIndexing} disabled={isPending || documents.length === 0}>
            {isPending ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            {documents.some((document) => document.automaticIndexStatus !== "A_TRAITER") ? "Relancer l'analyse" : "Analyser les documents"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Documents" value={documents.length} />
        <Metric label="À vérifier" value={toReview} tone={toReview > 0 ? "warning" : undefined} />
        <Metric label="Index validé" value={verified} tone="success" />
        <Metric label="Erreurs" value={errors} tone={errors > 0 ? "danger" : undefined} />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Contrôle terminé</span><span>{progress} %</span>
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
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><CheckCircle2 className="h-3.5 w-3.5" />Métadonnées contrôlées par un agent.</p>
                  ) : null}
                </div>
                {canIndex && document.automaticIndexStatus !== "EN_COURS" ? (
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
