"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TypePieceOption } from "@/components/dossiers/TypesPiecesField";

export interface PreindexDocument {
  id: number;
  nomOriginal: string;
  titreIndexation: string | null;
  referenceIndexation: string | null;
  dateDocument: string | null;
  nombrePages: number | null;
  preIndexNotes: string | null;
  preIndexStatus: "A_TRAITER" | "BROUILLON" | "PRET";
  typePiece: { id: number; libelle: string } | null;
  automaticIndexStatus: "A_TRAITER" | "EN_COURS" | "A_VERIFIER" | "INDEXE" | "ERREUR";
  indexingConfidence: number | null;
  classificationPath: string | null;
  lastIndexingError: string | null;
  indexValues: Array<{
    fieldId: number;
    value: string;
    confidence: number | null;
    source: "OCR" | "DOSSIER" | "MANUAL";
    validated: boolean;
  }>;
}

export interface IndexingFieldOption {
  id: number;
  key: string;
  label: string;
  dataType: "TEXT" | "DATE" | "NUMBER" | "IDENTIFIER";
  isRequired: boolean;
  isSearchable: boolean;
}

interface FormState {
  titreIndexation: string;
  referenceIndexation: string;
  dateDocument: string;
  nombrePages: string;
  typePieceId: string;
  preIndexNotes: string;
  indexValues: Record<string, string>;
  ready: boolean;
}

function formStateFromDocument(document: PreindexDocument, indexingFields: IndexingFieldOption[]): FormState {
  const currentValues = new Map(document.indexValues.map((value) => [value.fieldId, value.value]));
  return {
    titreIndexation: document.titreIndexation ?? document.nomOriginal.replace(/\.[^.]+$/, ""),
    referenceIndexation: document.referenceIndexation ?? "",
    dateDocument: document.dateDocument?.slice(0, 10) ?? "",
    nombrePages: document.nombrePages ? String(document.nombrePages) : "",
    typePieceId: document.typePiece ? String(document.typePiece.id) : "",
    preIndexNotes: document.preIndexNotes ?? "",
    indexValues: Object.fromEntries(indexingFields.map((field) => [String(field.id), currentValues.get(field.id) ?? ""])),
    ready: document.preIndexStatus === "PRET",
  };
}

export function DocumentPreindexDialog({
  document,
  typesPiece,
  indexingFields,
}: {
  document: PreindexDocument;
  typesPiece: TypePieceOption[];
  indexingFields: IndexingFieldOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => formStateFromDocument(document, indexingFields));
  const typeItems = typesPiece.map((type) => ({ label: type.libelle, value: String(type.id) }));
  const triggerLabel = document.automaticIndexStatus === "A_VERIFIER"
    ? "Contrôler"
    : document.automaticIndexStatus === "INDEXE"
      ? "Modifier l'index"
      : "Pré-indexer";

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setForm(formStateFromDocument(document, indexingFields));
    setOpen(nextOpen);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/preindex`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titreIndexation: form.titreIndexation || null,
          referenceIndexation: form.referenceIndexation || null,
          dateDocument: form.dateDocument || null,
          nombrePages: form.nombrePages ? Number(form.nombrePages) : null,
          typePieceId: form.typePieceId ? Number(form.typePieceId) : null,
          preIndexNotes: form.preIndexNotes || null,
          indexValues: indexingFields.map((field) => ({ fieldId: field.id, value: form.indexValues[String(field.id)] ?? "" })),
          ready: form.ready,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "La pré-indexation n'a pas pu être enregistrée.");
      toast.success(form.ready ? "Document prêt pour l'indexation." : "Brouillon de pré-indexation enregistré.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "La pré-indexation n'a pas pu être enregistrée.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        {document.automaticIndexStatus === "A_VERIFIER" ? <Sparkles /> : <Tags />}
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pré-indexation documentaire</DialogTitle>
          <DialogDescription>
            Qualifiez « {document.nomOriginal} » avant sa soumission au contrôle d&apos;indexation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`preindex-title-${document.id}`}>Titre documentaire</Label>
              <Input
                id={`preindex-title-${document.id}`}
                value={form.titreIndexation}
                maxLength={191}
                onChange={(event) => setForm((current) => ({ ...current, titreIndexation: event.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preindex-type-${document.id}`}>Type de pièce</Label>
              <Select
                items={typeItems}
                value={form.typePieceId || null}
                onValueChange={(value) => setForm((current) => ({ ...current, typePieceId: value ?? "" }))}
                disabled={isSaving}
              >
                <SelectTrigger id={`preindex-type-${document.id}`} className="w-full">
                  <SelectValue placeholder="Sélectionner un type" />
                </SelectTrigger>
                <SelectContent>
                  {typeItems.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preindex-reference-${document.id}`}>Référence métier</Label>
              <Input
                id={`preindex-reference-${document.id}`}
                value={form.referenceIndexation}
                maxLength={191}
                placeholder="Ex. TF 10245 / Bordereau 018"
                onChange={(event) => setForm((current) => ({ ...current, referenceIndexation: event.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preindex-date-${document.id}`}>Date du document</Label>
              <Input
                id={`preindex-date-${document.id}`}
                type="date"
                value={form.dateDocument}
                onChange={(event) => setForm((current) => ({ ...current, dateDocument: event.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`preindex-pages-${document.id}`}>Nombre de pages</Label>
              <Input
                id={`preindex-pages-${document.id}`}
                type="number"
                min={1}
                max={100000}
                value={form.nombrePages}
                onChange={(event) => setForm((current) => ({ ...current, nombrePages: event.target.value }))}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`preindex-notes-${document.id}`}>Notes de traitement</Label>
              <Textarea
                id={`preindex-notes-${document.id}`}
                value={form.preIndexNotes}
                maxLength={2000}
                rows={3}
                placeholder="Lisibilité, pièces manquantes, particularités du scan…"
                onChange={(event) => setForm((current) => ({ ...current, preIndexNotes: event.target.value }))}
                disabled={isSaving}
              />
            </div>
          </div>

          {indexingFields.length > 0 ? (
            <section className="space-y-3 border-t pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />Champs de recherche</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Contrôlez les propositions OCR avant de déclarer le document prêt.</p>
                </div>
                {document.indexingConfidence !== null ? (
                  <Badge variant="outline">Confiance {Math.round(document.indexingConfidence)} %</Badge>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {indexingFields.map((field) => {
                  const detected = document.indexValues.find((value) => value.fieldId === field.id);
                  const inputType = field.dataType === "DATE" ? "date" : field.dataType === "NUMBER" ? "number" : "text";
                  return (
                    <div key={field.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`index-field-${document.id}-${field.id}`}>
                          {field.label}{field.isRequired ? " *" : ""}
                        </Label>
                        {detected ? (
                          <span className="text-[11px] text-muted-foreground">
                            {detected.source === "OCR" ? "OCR" : detected.source === "DOSSIER" ? "Dossier" : "Vérifié"}
                            {detected.confidence !== null ? ` · ${Math.round(detected.confidence)} %` : ""}
                          </span>
                        ) : null}
                      </div>
                      <Input
                        id={`index-field-${document.id}-${field.id}`}
                        type={inputType}
                        value={form.indexValues[String(field.id)] ?? ""}
                        maxLength={500}
                        required={form.ready && field.isRequired}
                        onChange={(event) => setForm((current) => ({
                          ...current,
                          indexValues: { ...current.indexValues, [String(field.id)]: event.target.value },
                        }))}
                        disabled={isSaving}
                      />
                    </div>
                  );
                })}
              </div>
              {document.classificationPath ? (
                <div className="rounded-md border bg-muted/35 p-3">
                  <p className="text-xs font-medium">Classement proposé</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{document.classificationPath}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-muted/25 p-4">
            <Checkbox
              checked={form.ready}
              onCheckedChange={(value) => setForm((current) => ({ ...current, ready: value === true }))}
              disabled={isSaving}
            />
            <span>
              <span className="block text-sm font-medium">Prêt pour l&apos;indexation</span>
              <span className="block text-xs text-muted-foreground">
                Le titre, le type de pièce et le nombre de pages deviennent obligatoires.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>Annuler</Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Tags />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
