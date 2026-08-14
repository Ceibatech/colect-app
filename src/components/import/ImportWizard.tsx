"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileDown, Loader2, CheckCircle2, AlertTriangle, Copy, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ImportRowResult {
  line: number;
  data: Record<string, string | undefined>;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  isValid: boolean;
}

interface ImportPreview {
  fileName: string;
  totalLignes: number;
  valides: number;
  invalides: number;
  doublons: number;
  importables: number;
  rows: ImportRowResult[];
}

function StatBox({ label, value, tone }: { label: string; value: number; tone?: "destructive" | "success" | "default" }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div
        className={
          "text-2xl font-semibold tabular-nums " +
          (tone === "destructive" ? "text-destructive" : tone === "success" ? "text-primary" : "")
        }
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  function handleFileSelected(file: File) {
    setResult(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/import", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de la lecture du fichier.");
        setPreview(data);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la lecture du fichier.");
      }
    });
  }

  function confirm() {
    if (!preview) return;
    // Envoie TOUTES les lignes (pas seulement les valides) : le serveur
    // revalide chacune intégralement (§60) et ne crée que celles qui
    // repassent la validation, tout en conservant des totaux d'import
    // (imports.nombre_lignes/invalides/doublons) fidèles au fichier
    // d'origine plutôt qu'au seul lot confirmé.
    const allRows = preview.rows.map((r) => r.data);
    startTransition(async () => {
      try {
        const res = await fetch("/api/import/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: preview.fileName, rows: allRows }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Erreur lors de l'import.");
        setResult(data);
        toast.success(`${data.imported} dossier(s) importé(s) en brouillon.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'import.");
      }
    });
  }

  function reset() {
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (result) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Import terminé</h3>
            <p className="text-sm text-muted-foreground">
              {result.imported} dossier(s) créé(s) en brouillon
              {result.skipped > 0 ? `, ${result.skipped} ligne(s) ignorée(s)` : ""}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              Nouvel import
            </Button>
            <Button onClick={() => router.push("/dossiers")}>Voir les dossiers</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Charger un fichier</CardTitle>
          <CardDescription>Formats acceptés : .csv, .xlsx — 5 Mo maximum.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={isPending} onClick={() => fileInputRef.current?.click()}>
              {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
              Choisir un fichier
            </Button>
            <a href="/api/import/template" className={buttonVariants({ variant: "outline" })}>
              <FileDown className="mr-1 h-4 w-4" />
              Télécharger le modèle .xlsx
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            La première ligne doit contenir les en-têtes du modèle. L&apos;opérateur (matricule) est obligatoire ;
            commune/lotissement/nature sont reconnus par code ou libellé. Les dossiers sont importés en{" "}
            <strong>brouillon</strong> — à compléter et soumettre ensuite via la Collecte.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>2. Prévisualisation — {preview.fileName}</CardTitle>
          <CardDescription>Vérifiez les lignes avant de confirmer. Rien n&apos;est encore enregistré.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatBox label="Lignes" value={preview.totalLignes} />
            <StatBox label="Valides" value={preview.valides} tone="success" />
            <StatBox label="Invalides" value={preview.invalides} tone="destructive" />
            <StatBox label="Doublons" value={preview.doublons} tone="destructive" />
            <StatBox label="Importables" value={preview.importables} tone="success" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Ligne</TableHead>
                  <TableHead>Opérateur</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Code-barres</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="text-muted-foreground">{r.line}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.data.operateurMatricule ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{[r.data.nom, r.data.prenoms].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.data.codeBarres ?? "—"}</TableCell>
                    <TableCell>
                      {r.isDuplicate ? (
                        <Badge variant="destructive"><Copy className="mr-1 h-3 w-3" />Doublon</Badge>
                      ) : r.isValid ? (
                        <Badge><CheckCircle2 className="mr-1 h-3 w-3" />Valide</Badge>
                      ) : (
                        <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Invalide</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm text-xs text-muted-foreground">
                      {[...r.errors, ...r.warnings].length > 0 ? (
                        <ul className="space-y-0.5">
                          {r.errors.map((e, i) => (
                            <li key={`e${i}`} className="text-destructive">
                              {e}
                            </li>
                          ))}
                          {r.warnings.map((w, i) => (
                            <li key={`w${i}`} className="flex items-start gap-1">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={reset} disabled={isPending}>
          Annuler
        </Button>
        <Button onClick={confirm} disabled={isPending || preview.importables === 0}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Confirmer l&apos;import ({preview.importables} dossier{preview.importables > 1 ? "s" : ""})
        </Button>
      </div>
    </div>
  );
}
