"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";

interface Option {
  value: string;
  label: string;
}

export function ExportFilterForm({
  communes,
  operateurs,
  showOperateurFilter,
}: {
  communes: Option[];
  operateurs: Option[];
  showOperateurFilter: boolean;
}) {
  const [nonIndexes, setNonIndexes] = useState(false);

  return (
    <form method="get" action="/api/export" className="space-y-5 rounded-lg border border-border/70 bg-background/70 p-4 shadow-sm">
      <div className="space-y-1.5">
        <Label htmlFor="export-q" className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Recherche</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="export-q" name="q" placeholder="Référence, code-barres, N° DDU, nom..." className="h-10 bg-card pl-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Commune</Label>
          <Select name="commune" items={communes.map((c) => ({ label: c.label, value: c.value }))}>
            <SelectTrigger className="h-9 w-full bg-card">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              {communes.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showOperateurFilter && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Opérateur</Label>
            <Select name="operateur" items={operateurs.map((o) => ({ label: o.label, value: o.value }))}>
              <SelectTrigger className="h-9 w-full bg-card">
                <SelectValue placeholder="Tous" />
              </SelectTrigger>
              <SelectContent>
                {operateurs.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Statut</Label>
          <Select
            name="statutValidation"
            items={[
              { label: "Tous", value: "" },
              { label: "Validés", value: "VALIDE" },
              { label: "Rejetés", value: "REJETE" },
              { label: "En contrôle", value: "EN_CONTROLE" },
            ]}
            defaultValue=""
          >
            <SelectTrigger className="h-9 w-full bg-card">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              <SelectItem value="VALIDE">Validés</SelectItem>
              <SelectItem value="REJETE">Rejetés</SelectItem>
              <SelectItem value="EN_CONTROLE">En contrôle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Archivage</Label>
          <Select
            name="statutArchivage"
            items={[
              { label: "Tous", value: "" },
              { label: "Archivés uniquement", value: "TERMINE" },
            ]}
            defaultValue=""
          >
            <SelectTrigger className="h-9 w-full bg-card">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              <SelectItem value="TERMINE">Archivés uniquement</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border/70 bg-card p-3">
        <div className="flex h-9 items-center gap-2 rounded-md border border-border/70 px-3">
          <Checkbox
            id="nonIndexesCheckbox"
            checked={nonIndexes}
            onCheckedChange={(v) => setNonIndexes(v === true)}
          />
          <input type="hidden" name="nonIndexes" value={nonIndexes ? "1" : "0"} />
          <Label htmlFor="nonIndexesCheckbox" className="font-normal">
            Non indexés uniquement
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Du</Label>
          <Input type="date" name="from" className="h-9 w-auto bg-background/70" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Au</Label>
          <Input type="date" name="to" className="h-9 w-auto bg-background/70" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <RadioGroup name="format" defaultValue="csv" className="flex gap-2 rounded-lg border border-border/70 bg-card p-1">
          <div className="flex h-8 items-center gap-2 rounded-md px-2">
            <RadioGroupItem value="csv" id="format-csv" />
            <Label htmlFor="format-csv" className="font-normal">
              CSV
            </Label>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md px-2">
            <RadioGroupItem value="xlsx" id="format-xlsx" />
            <Label htmlFor="format-xlsx" className="font-normal">
              Excel (.xlsx)
            </Label>
          </div>
        </RadioGroup>

        <Button type="submit" size="lg" className="h-9 shadow-sm">
          <Download className="mr-1 h-4 w-4" />
          Exporter
        </Button>
      </div>
    </form>
  );
}