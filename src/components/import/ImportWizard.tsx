"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileDown, Loader2, CheckCircle2, AlertTriangle, Copy, XCircle, FileSpreadsheet, RefreshCw } from "lucide-react";
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

function StatBox({ label, value, tone = "default" }: { label: string; value: number; tone?: "destructive" | "success" | "default" }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3 text-center shadow-sm">
      <div className={"text-2xl font-semibold tabular-nums " + (tone === "destructive" ? "text-destructive" : tone === "success" ? "text-brand-green" : "text-primary")}>{value}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
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
      <Card className="mx-auto max-w-2xl border-brand-green/20 bg-card/95">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-12">
          <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">Import terminé</h3>
            <p className="text-sm text-muted-foreground">
              {result.imported} dossier(s) créé(s) en brouillon
              {result.skipped > 0 ? `, ${result.skipped} ligne(s) ignorée(s)` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={reset}>
              <RefreshCw className="mr-1 h-4 w-4" />
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
          <CardTitle>Charger un fichier</CardTitle>
          <CardDescription>Formats acceptés : .csv, .xlsx — 5 Mo maximum.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-dashed border-border/80 bg-background/70 p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-7 w-7" />
            </span>
            <div className="mt-4 space-y-1">
              <h2 className="text-base font-semibold">Déposez un fichier préparé depuis le modèle</h2>
              <p className="text-sm text-muted-foreground">Les dossiers importés resteront en brouillon pour contrôle avant soumission.</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
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
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            La première ligne doit contenir les en-têtes du modèle. L&apos;opérateur (matricule) est obligatoire ; commune/lotissement/nature sont reconnus par code ou libellé.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prévisualisation — {preview.fileName}</CardTitle>
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
        <CardContent className="p-4 sm:p-5">
          <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
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
                  <TableRow key={r.line} className="hover:bg-accent/30">
                    <TableCell className="text-muted-foreground">{r.line}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{r.data.operateurMatricule ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{[r.data.nom, r.data.prenoms].filter(Boolean).join(" ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.data.codeBarres ?? "—"}</TableCell>
                    <TableCell>
                      {r.isDuplicate ? (
                        <Badge variant="destructive" className="rounded-md"><Copy className="mr-1 h-3 w-3" />Doublon</Badge>
                      ) : r.isValid ? (
                        <Badge className="rounded-md"><CheckCircle2 className="mr-1 h-3 w-3" />Valide</Badge>
                      ) : (
                        <Badge variant="destructive" className="rounded-md"><XCircle className="mr-1 h-3 w-3" />Invalide</Badge>
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

      <div className="flex flex-wrap justify-end gap-2 rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm">
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
