"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";
import { DocumentPreindexDialog, type PreindexDocument } from "@/components/dossiers/DocumentPreindexDialog";
import type { TypePieceOption } from "@/components/dossiers/TypesPiecesField";

interface DocumentRow extends PreindexDocument {
  typeMime: string;
  taille: number;
  hash: string | null;
  storageProvider: "LOCAL" | "CPANEL" | "S3" | "SHAREPOINT" | "OTHER";
  externalWebUrl: string | null;
  digitalArchiveStatus: "NON_REQUIS" | "EN_ATTENTE" | "EN_COURS" | "ARCHIVE" | "ERREUR";
  alfrescoWebUrl: string | null;
  alfrescoArchivedAt: string | null;
  alfrescoArchiveError: string | null;
  preIndexedAt: string | null;
  preIndexer: { name: string } | null;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.tif,.tiff";
const STATUS = {
  A_TRAITER: { label: "À qualifier", variant: "outline" as const },
  BROUILLON: { label: "Brouillon", variant: "secondary" as const },
  PRET: { label: "Prêt", variant: "default" as const },
};

const ARCHIVE_STATUS = {
  EN_ATTENTE: { label: "Versement en attente", variant: "outline" as const },
  EN_COURS: { label: "Versement en cours", variant: "secondary" as const },
  ARCHIVE: { label: "Conservé dans Alfresco", variant: "default" as const },
  ERREUR: { label: "Échec Alfresco", variant: "destructive" as const },
};

export function DocumentsPanel({
  dossierId,
  documents,
  canManage,
  canPreindex,
  typesPiece,
  activeStorageProvider,
  digitalArchiveEnabled,
  canRetryDigitalArchive,
}: {
  dossierId: number;
  documents: DocumentRow[];
  canManage: boolean;
  canPreindex: boolean;
  typesPiece: TypePieceOption[];
  activeStorageProvider: "LOCAL" | "SHAREPOINT";
  digitalArchiveEnabled: boolean;
  canRetryDigitalArchive: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const readyCount = documents.filter((document) => document.preIndexStatus === "PRET").length;
  const archivedCount = documents.filter((document) => document.digitalArchiveStatus === "ARCHIVE").length;
  const archiveErrorCount = documents.filter((document) => document.digitalArchiveStatus === "ERREUR").length;

  function upload(files: File[]) {
    startTransition(async () => {
      const results = await Promise.all(files.map(async (file) => {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch(`/api/dossiers/${dossierId}/documents`, { method: "POST", body: formData });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Erreur lors de l'ajout du document.");
          return { success: true, name: file.name };
        } catch (error) {
          return {
            success: false,
            name: file.name,
            error: error instanceof Error ? error.message : "Erreur lors de l'ajout du document.",
          };
        }
      }));
      const successes = results.filter((result) => result.success);
      const failures = results.filter((result) => !result.success);

      if (successes.length > 0) {
        toast.success(
          `${successes.length} document(s) chargé(s)${activeStorageProvider === "SHAREPOINT" ? " dans SharePoint" : ""}.`,
        );
        router.refresh();
      }
      if (failures.length > 0) {
        toast.error(`${failures.length} échec(s). ${failures[0]?.name} : ${failures[0]?.error}`);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function remove(id: number, name: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de la suppression.");
        toast.success(`${name} supprimé.`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression.");
      }
    });
  }

  function retryDigitalArchive() {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/dossiers/${dossierId}/documents/archive`, { method: "POST" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Impossible de relancer le versement Alfresco.");
        if (data.queued > 0) {
          toast.success(`${data.queued} document(s) remis en file de versement Alfresco.`);
        } else {
          toast.info("Tous les documents prêts sont déjà archivés dans Alfresco.");
        }
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Impossible de relancer le versement Alfresco.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Archives numériques</h3>
            <Badge variant={readyCount === documents.length && documents.length > 0 ? "default" : "outline"}>
              {readyCount}/{documents.length} pré-indexés
            </Badge>
            {digitalArchiveEnabled ? (
              <Badge variant={archivedCount === documents.length && documents.length > 0 ? "default" : "outline"}>
                {archivedCount}/{documents.length} dans Alfresco
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Les fichiers sont qualifiés ici avant la soumission de l&apos;indexation.
          </p>
        </div>
        {canManage || (canRetryDigitalArchive && archiveErrorCount > 0) ? (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {canRetryDigitalArchive && archiveErrorCount > 0 ? (
              <Button variant="outline" size="sm" disabled={isPending} onClick={retryDigitalArchive}>
                {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Relancer Alfresco
              </Button>
            ) : null}
            {canManage ? (
              <>
                <Button disabled={isPending} onClick={() => fileInputRef.current?.click()}>
                  {isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                  {activeStorageProvider === "SHAREPOINT" ? "Charger vers SharePoint" : "Ajouter un document"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length > 0) upload(files);
                  }}
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">PDF, JPEG, PNG, TIFF · 20 Mo max.</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {documents.length === 0 ? (
        <ModulePlaceholder
          title="Aucun document"
          phase="Ajoutez le premier scan de ce dossier"
          description="Les archives numériques associées au dossier apparaîtront ici."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border">
          {documents.map((document) => {
            const status = STATUS[document.preIndexStatus];
            const archiveStatus = document.digitalArchiveStatus === "NON_REQUIS"
              ? null
              : ARCHIVE_STATUS[document.digitalArchiveStatus];
            return (
              <div key={document.id} className="grid gap-4 bg-background p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{document.titreIndexation ?? document.nomOriginal}</p>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <Badge variant="outline" className="gap-1">
                        {document.storageProvider === "SHAREPOINT" ? <Cloud /> : <HardDrive />}
                        {document.storageProvider === "SHAREPOINT" ? "SharePoint" : "Local"}
                      </Badge>
                      {archiveStatus ? (
                        <Badge
                          variant={archiveStatus.variant}
                          className="gap-1"
                          title={document.alfrescoArchiveError ?? undefined}
                        >
                          <Archive />
                          {archiveStatus.label}
                        </Badge>
                      ) : null}
                    </div>
                    {document.titreIndexation ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{document.nomOriginal}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatSize(document.taille)}</span>
                      <span>{document.typePiece?.libelle ?? "Type à renseigner"}</span>
                      <span>{document.nombrePages ? `${document.nombrePages} page(s)` : "Pagination à renseigner"}</span>
                      <span>Ajouté le {new Date(document.createdAt).toLocaleDateString("fr-FR")}</span>
                      {document.preIndexedAt && document.preIndexer ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                          Traité par {document.preIndexer.name}
                        </span>
                      ) : null}
                      {document.alfrescoArchivedAt ? (
                        <span>Versé le {new Date(document.alfrescoArchivedAt).toLocaleDateString("fr-FR")}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canPreindex ? <DocumentPreindexDialog document={document} typesPiece={typesPiece} /> : null}
                  <a
                    href={`/api/documents/${document.id}/download`}
                    aria-label={`Télécharger ${document.nomOriginal}`}
                    title="Télécharger"
                    className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {document.externalWebUrl ? (
                    <a
                      href={document.externalWebUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ouvrir ${document.nomOriginal} dans SharePoint`}
                      title="Ouvrir dans SharePoint"
                      className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {document.alfrescoWebUrl ? (
                    <a
                      href={document.alfrescoWebUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ouvrir ${document.nomOriginal} dans Alfresco`}
                      title="Ouvrir dans Alfresco"
                      className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                    >
                      <Archive className="h-4 w-4" />
                    </a>
                  ) : null}
                  {canManage ? (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button size="icon-sm" variant="ghost" disabled={isPending} aria-label={`Supprimer ${document.nomOriginal}`} title="Supprimer">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            « {document.nomOriginal} » sera supprimé de {document.storageProvider === "SHAREPOINT" ? "SharePoint" : "l'espace local"}. Cette action est irréversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(document.id, document.nomOriginal)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
