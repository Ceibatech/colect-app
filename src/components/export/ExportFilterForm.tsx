"use client";

import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { useState } from "react";

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
    <form method="get" action="/api/export" className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <Label htmlFor="export-q">Recherche</Label>
        <Input id="export-q" name="q" placeholder="Référence, code-barres, N° DDU, nom..." />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Commune</Label>
          <Select name="commune" items={communes.map((c) => ({ label: c.label, value: c.value }))}>
            <SelectTrigger className="w-full">
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
          <div className="space-y-1">
            <Label>Opérateur</Label>
            <Select name="operateur" items={operateurs.map((o) => ({ label: o.label, value: o.value }))}>
              <SelectTrigger className="w-full">
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

        <div className="space-y-1">
          <Label>Statut</Label>
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
            <SelectTrigger className="w-full">
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

        <div className="space-y-1">
          <Label>Archivage</Label>
          <Select
            name="statutArchivage"
            items={[
              { label: "Tous", value: "" },
              { label: "Archivés uniquement", value: "TERMINE" },
            ]}
            defaultValue=""
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              <SelectItem value="TERMINE">Archivés uniquement</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
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

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Du</Label>
          <Input type="date" name="from" className="w-auto" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Au</Label>
          <Input type="date" name="to" className="w-auto" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <RadioGroup name="format" defaultValue="csv" className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="csv" id="format-csv" />
            <Label htmlFor="format-csv" className="font-normal">
              CSV
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="xlsx" id="format-xlsx" />
            <Label htmlFor="format-xlsx" className="font-normal">
              Excel (.xlsx)
            </Label>
          </div>
        </RadioGroup>

        <Button type="submit">
          <Download className="mr-1 h-4 w-4" />
          Exporter
        </Button>
      </div>
    </form>
  );
}
