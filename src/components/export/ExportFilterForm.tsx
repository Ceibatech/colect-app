"use client";

import { useState, type ReactNode } from "react";
import {
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
}

export function ExportFilterForm({
  communes,
  operateurs,
  showOperateurFilter,
  scopeLabel,
  scopeDescription,
}: {
  communes: Option[];
  operateurs: Option[];
  showOperateurFilter: boolean;
  scopeLabel: string;
  scopeDescription: string;
}) {
  const [nonIndexes, setNonIndexes] = useState(false);
  const [format, setFormat] = useState("csv");

  return (
    <form
      method="get"
      action="/api/export"
      className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_18px_48px_rgba(16,24,40,0.07)]"
      onReset={() => {
        setNonIndexes(false);
        setFormat("csv");
      }}
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 p-4 sm:p-5 lg:p-6">
          <div className="flex items-start gap-3 border-b border-border/60 pb-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
              <Filter className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Ciblage des dossiers</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Croisez les critères nécessaires; les champs laissés vides n&apos;excluent aucun résultat.</p>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <Field label="Recherche globale" htmlFor="export-q">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="export-q" name="q" placeholder="Référence, code-barres, N° DDU ou titulaire" className="h-11 bg-background pl-10" />
              </div>
            </Field>

            <div className={cn("grid gap-4 sm:grid-cols-2", showOperateurFilter ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
              <SelectField
                label="Commune"
                name="commune"
                placeholder="Toutes les communes"
                options={communes}
              />
              {showOperateurFilter ? (
                <SelectField
                  label="Opérateur"
                  name="operateur"
                  placeholder="Tous les opérateurs"
                  options={operateurs}
                />
              ) : null}
              <SelectField
                label="Statut de validation"
                name="statutValidation"
                placeholder="Tous les statuts"
                options={[
                  { label: "Validé", value: "VALIDE" },
                  { label: "Rejeté", value: "REJETE" },
                  { label: "En contrôle", value: "EN_CONTROLE" },
                ]}
              />
              <SelectField
                label="Archivage"
                name="statutArchivage"
                placeholder="Tous les dossiers"
                options={[{ label: "Archivés uniquement", value: "TERMINE" }]}
              />
            </div>
          </div>

          <div className="mt-6 border-t border-border/60 pt-5">
            <div className="mb-4 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Période et niveau de traitement</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(15rem,1.2fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)] xl:items-end">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background px-3.5 py-2.5 transition-colors hover:border-primary/35 hover:bg-primary/[0.025]">
                <Checkbox
                  id="nonIndexesCheckbox"
                  checked={nonIndexes}
                  onCheckedChange={(value) => setNonIndexes(value === true)}
                />
                <input type="hidden" name="nonIndexes" value={nonIndexes ? "1" : "0"} />
                <span className="text-sm font-medium">Uniquement les dossiers non indexés</span>
              </label>
              <Field label="Date de début" htmlFor="export-from">
                <Input id="export-from" type="date" name="from" className="h-11 bg-background" />
              </Field>
              <Field label="Date de fin" htmlFor="export-to">
                <Input id="export-to" type="date" name="to" className="h-11 bg-background" />
              </Field>
            </div>
          </div>
        </div>

        <aside className="flex flex-col border-t border-border/60 bg-muted/20 p-4 sm:p-5 lg:border-l lg:border-t-0 lg:p-6">
          <div className="flex items-start gap-3 border-b border-border/60 pb-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Périmètre appliqué</p>
              <p className="mt-1 font-semibold">{scopeLabel}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{scopeDescription}</p>
            </div>
          </div>

          <div className="py-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Format de livraison</p>
            <RadioGroup name="format" value={format} onValueChange={setFormat} className="mt-3 grid gap-2">
              <FormatOption
                value="csv"
                selected={format === "csv"}
                icon={FileText}
                title="CSV"
                description="Compatible avec les traitements de données"
              />
              <FormatOption
                value="xlsx"
                selected={format === "xlsx"}
                icon={FileSpreadsheet}
                title="Excel (.xlsx)"
                description="Prêt pour l'analyse et le partage"
              />
            </RadioGroup>
          </div>

          <div className="mt-auto space-y-3 border-t border-border/60 pt-5">
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-green" />
              L&apos;extraction respecte automatiquement votre rôle et les filtres sélectionnés.
            </p>
            <Button type="submit" size="lg" className="h-11 w-full shadow-sm">
              <Download className="mr-1.5 h-4 w-4" />
              Générer l&apos;export
            </Button>
            <Button type="reset" variant="ghost" className="h-9 w-full text-muted-foreground">
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Réinitialiser les filtres
            </Button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function SelectField({ label, name, placeholder, options }: { label: string; name: string; placeholder: string; options: Option[] }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`export-${name}`} className="text-xs font-medium uppercase text-muted-foreground">{label}</Label>
      <Select name={name} items={options}>
        <SelectTrigger id={`export-${name}`} className="h-11 w-full bg-background">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FormatOption({
  value,
  selected,
  icon: Icon,
  title,
  description,
}: {
  value: string;
  selected: boolean;
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <Label
      htmlFor={`format-${value}`}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
        selected ? "border-primary/45 bg-primary/[0.055] ring-1 ring-primary/10" : "border-border/70 bg-background hover:border-primary/25",
      )}
    >
      <RadioGroupItem value={value} id={`format-${value}`} />
      <Icon className={cn("h-5 w-5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{description}</span>
      </span>
    </Label>
  );
}