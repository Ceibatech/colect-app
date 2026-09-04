"use client";

import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DossierSearchParams } from "@/lib/validation/dossier-search";
import {
  STATUT_COLLECTE_LABELS,
  STATUT_VALIDATION_LABELS,
  STATUT_NUMERISATION_LABELS,
  STATUT_INDEXATION_LABELS,
  STATUT_ARCHIVAGE_LABELS,
} from "@/lib/utils/dossier-status";

interface Option {
  value: string;
  label: string;
}

export function DossiersFilterBar({
  current,
  communes,
  natures,
  operateurs,
  showOperateurFilter,
}: {
  current: DossierSearchParams;
  communes: Option[];
  natures: Option[];
  operateurs: Option[];
  showOperateurFilter: boolean;
}) {
  const toDateInput = (d?: Date) => (d ? d.toISOString().slice(0, 10) : undefined);

  return (
    <form method="get" action="/dossiers" className="space-y-4 rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          Recherche et filtres
        </div>
        <Link href="/dossiers" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <X className="mr-1 h-4 w-4" />
          Réinitialiser
        </Link>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={current.q ?? ""}
            placeholder="Référence, code-barres, Direction/Service, nom, prénoms..."
            className="h-10 pl-9"
          />
        </div>
        <Button type="submit" size="lg" className="h-10 min-w-28 shadow-sm">
          Filtrer
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <NamedSelect name="commune" label="Commune" defaultValue={current.commune?.toString()} options={communes} />
        <NamedSelect name="nature" label="Nature" defaultValue={current.nature?.toString()} options={natures} />
        {showOperateurFilter && (
          <NamedSelect name="operateur" label="Opérateur" defaultValue={current.operateur?.toString()} options={operateurs} />
        )}
        <NamedSelect
          name="statutCollecte"
          label="Collecte"
          defaultValue={current.statutCollecte}
          options={Object.entries(STATUT_COLLECTE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <NamedSelect
          name="statutValidation"
          label="Validation"
          defaultValue={current.statutValidation}
          options={Object.entries(STATUT_VALIDATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <NamedSelect
          name="statutNumerisation"
          label="Numérisation"
          defaultValue={current.statutNumerisation}
          options={Object.entries(STATUT_NUMERISATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <NamedSelect
          name="statutIndexation"
          label="Indexation"
          defaultValue={current.statutIndexation}
          options={Object.entries(STATUT_INDEXATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <NamedSelect
          name="statutArchivage"
          label="Archivage"
          defaultValue={current.statutArchivage}
          options={Object.entries(STATUT_ARCHIVAGE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Du</label>
          <Input type="date" name="from" defaultValue={toDateInput(current.from)} className="h-9 bg-background/70" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Au</label>
          <Input type="date" name="to" defaultValue={toDateInput(current.to)} className="h-9 bg-background/70" />
        </div>
      </div>
    </form>
  );
}

// Select natif au formulaire (soumission GET), avec un `name` transmis par Base UI
// via un input caché — pas besoin de state React ni de handler côté client.
// Valeurs toujours en chaîne : le formulaire GET produit de toute façon des
// paramètres d'URL textuels, convertis en nombre par le schéma Zod côté serveur.
function NamedSelect({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: Option[];
}) {
  const items = options.map((o) => ({ label: o.label, value: o.value }));

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      <Select name={name} items={items} defaultValue={defaultValue}>
        <SelectTrigger className="h-9 w-full bg-background/70">
          <SelectValue placeholder="Tous" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}