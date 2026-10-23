"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Download, FileCheck2, FileSignature, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TransferDocumentState = "MINISTRY_ACTION" | "CEIBA_ACTION" | "SIGNED";

export interface TransferDocumentItem {
  key: string;
  code: "F01" | "F02";
  title: string;
  detail: string;
  status: string;
  state: TransferDocumentState;
  actionHref: string;
  downloadHref: string | null;
}

type Filter = "ALL" | TransferDocumentState;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "Tous" },
  { value: "MINISTRY_ACTION", label: "À signer par le ministère" },
  { value: "CEIBA_ACTION", label: "En attente CEIBA" },
  { value: "SIGNED", label: "Validés" },
];

export function TransferDocumentRegistry({ documents }: { documents: TransferDocumentItem[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query);
  const visibleDocuments = useMemo(() => documents.filter((document) => {
    if (filter !== "ALL" && document.state !== filter) return false;
    if (!normalizedQuery) return true;
    return normalize(`${document.code} ${document.title} ${document.detail} ${document.status}`).includes(normalizedQuery);
  }), [documents, filter, normalizedQuery]);

  function countFor(value: Filter) {
    return value === "ALL" ? documents.length : documents.filter((document) => document.state === value).length;
  }

  return (
    <Card className="bg-card/95">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileSignature className="h-4 w-4" /></span>
            <div>
              <CardTitle>Bordereaux et autorisations</CardTitle>
              <CardDescription>Recherchez les F01 et F02 en attente, à signer ou déjà validés selon votre rôle.</CardDescription>
            </div>
          </div>
          <div className="relative w-full lg:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Référence du bordereau ou du lot" className="pl-9" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Filtrer les bordereaux">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filter === option.value ? "default" : "outline"}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
              <Badge variant={filter === option.value ? "secondary" : "outline"} className="ml-1 rounded-md">{countFor(option.value)}</Badge>
            </Button>
          ))}
        </div>
      </CardHeader>

      {visibleDocuments.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <FileCheck2 className="mx-auto h-9 w-9 text-muted-foreground/50" />
          <p className="mt-3 font-medium">Aucun bordereau ne correspond à cette sélection</p>
          <p className="mt-1 text-sm text-muted-foreground">Modifiez la recherche ou choisissez un autre état.</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {visibleDocuments.map((document) => (
            <article key={document.key} className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green"><FileCheck2 className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-md">{document.code}</Badge><p className="font-semibold">{document.title}</p></div>
                  <p className="mt-1 text-sm text-muted-foreground">{document.detail}</p>
                  <p className="mt-1 text-xs font-medium text-primary">{document.status}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link href={document.actionHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ArrowRight /> Ouvrir le workflow</Link>
                {document.downloadHref ? <a href={document.downloadHref} className={cn(buttonVariants({ size: "sm" }))}><Download /> Télécharger {document.code}</a> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}
