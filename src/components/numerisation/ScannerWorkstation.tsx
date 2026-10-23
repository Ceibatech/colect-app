"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, ScanLine, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NumerisationDossierItem } from "@/lib/services/production-queue-service";

const ACCEPTED = ".pdf,.jpg,.jpeg,.png,.tif,.tiff";

export function ScannerWorkstation({ dossiers }: { dossiers: NumerisationDossierItem[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dossierId, setDossierId] = useState(dossiers.find((item) => item.statutNumerisation !== "TERMINE")?.id ?? dossiers[0]?.id ?? 0);
  const [pending, startTransition] = useTransition();
  const activeDossier = useMemo(() => dossiers.find((item) => item.id === dossierId), [dossierId, dossiers]);
  const [progress, setProgress] = useState<Array<{ name: string; status: "sending" | "done" | "error" }>>([]);

  function upload(files: File[]) {
    if (!dossierId || files.length === 0) return;
    setProgress(files.map((file) => ({ name: file.name, status: "sending" })));
    startTransition(async () => {
      let successCount = 0;
      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const response = await fetch(`/api/dossiers/${dossierId}/documents`, { method: "POST", body: formData });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error ?? "Échec du versement.");
          successCount += 1;
          setProgress((current) => current.map((item) => item.name === file.name ? { ...item, status: "done" } : item));
        } catch {
          setProgress((current) => current.map((item) => item.name === file.name ? { ...item, status: "error" } : item));
        }
      }
      if (successCount > 0) toast.success(`${successCount} fichier(s) versé(s) et envoyés au traitement automatique.`);
      if (successCount < files.length) toast.error(`${files.length - successCount} fichier(s) n'ont pas pu être versés.`);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-4 border-r-0 border-border/70 lg:border-r lg:pr-5">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold"><ScanLine className="h-5 w-5 text-primary" />Poste scanner</h3>
          <p className="mt-1 text-sm text-muted-foreground">Choisissez le dossier du carton, puis versez les fichiers produits par le scanner au fur et à mesure.</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Dossier destinataire</span>
          <select
            value={dossierId}
            onChange={(event) => setDossierId(Number(event.target.value))}
            disabled={pending}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {dossiers.map((item) => (
              <option key={item.id} value={item.id}>{item.reference} · {[item.nom, item.prenoms].filter(Boolean).join(" ") || "Sans titulaire"}</option>
            ))}
          </select>
        </label>
        <div className="rounded-md border border-dashed bg-muted/20 p-5 text-center">
          <p className="font-medium">{activeDossier?.reference ?? "Sélectionnez un dossier"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{activeDossier?.documents.length ?? 0} fichier(s) déjà associé(s)</p>
          <Button className="mt-4" disabled={pending || !activeDossier} onClick={() => inputRef.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            Récupérer les fichiers du scanner
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            multiple
            className="hidden"
            onChange={(event) => upload(Array.from(event.target.files ?? []))}
          />
          <p className="mt-2 text-xs text-muted-foreground">PDF, JPEG, PNG ou TIFF, 20 Mo maximum par fichier.</p>
        </div>
        {progress.length > 0 ? (
          <div className="divide-y rounded-md border">
            {progress.map((item, index) => (
              <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{item.name}</span>
                {item.status === "sending" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                {item.status === "done" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                {item.status === "error" ? <Badge variant="destructive">Échec</Badge> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="text-base font-semibold">État du carton</h3>
        <div className="mt-3 divide-y overflow-hidden rounded-md border">
          {dossiers.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDossierId(item.id)}
              className="flex w-full items-center justify-between gap-4 bg-background px-4 py-3 text-left hover:bg-accent/35"
            >
              <span className="flex min-w-0 items-center gap-3">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-semibold text-primary">{item.reference}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[item.nom, item.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{item.documents.length} fichier(s)</Badge>
                <Badge variant={item.statutNumerisation === "TERMINE" ? "default" : "secondary"}>
                  {item.statutNumerisation === "TERMINE" ? "Numérisé" : "À numériser"}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
