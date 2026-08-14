"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Download, Trash2, FileText, Loader2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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

interface DocumentRow {
  id: number;
  nomOriginal: string;
  typeMime: string;
  taille: number;
  hash: string | null;
  nombrePages: number | null;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.tif,.tiff";

export function DocumentsPanel({
  dossierId,
  documents,
  canManage,
}: {
  dossierId: number;
  documents: DocumentRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function upload(file: File) {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/dossiers/${dossierId}/documents`, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'ajout du document.");
        toast.success(`${file.name} ajouté.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'ajout du document.");
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
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la suppression.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div>
          <Button disabled={isPending} onClick={() => fileInputRef.current?.click()}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            Ajouter un document
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">PDF, JPEG, PNG, TIFF — 20 Mo maximum.</p>
        </div>
      )}

      {documents.length === 0 ? (
        <ModulePlaceholder
          title="Aucun document"
          phase="Ajoutez le premier scan de ce dossier"
          description="Les documents numérisés associés à ce dossier apparaîtront ici."
        />
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.nomOriginal}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatSize(d.taille)} · {d.typeMime} · {new Date(d.createdAt).toLocaleDateString("fr-FR")}
                    {d.hash && <span className="ml-1 font-mono">· {d.hash.slice(0, 12)}…</span>}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/documents/${d.id}/download`}
                  aria-label="Télécharger"
                  className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                >
                  <Download className="h-4 w-4" />
                </a>
                {canManage && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button size="icon-sm" variant="ghost" disabled={isPending} aria-label="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer ce document ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          « {d.nomOriginal} » sera définitivement supprimé du stockage. Cette action est irréversible.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => remove(d.id, d.nomOriginal)}>Supprimer</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
