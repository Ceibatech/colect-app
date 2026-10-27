"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, FileText, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartonSuggestion, DossierSuggestion, Suggestion, SuggestStage } from "@/lib/search/suggestions";
import { cn } from "@/lib/utils";

type Result = { cartons: CartonSuggestion[]; dossiers: DossierSuggestion[]; approx: boolean };
const EMPTY: Result = { cartons: [], dossiers: [], approx: false };

/**
 * Champ de recherche des files de production qui propose, pendant la saisie,
 * les cartons (référence ou libellé) et les dossiers (référence, titulaire)
 * correspondants. Flèches + Entrée pour choisir ; Entrée sans choix lance la
 * recherche classique.
 */
export function SmartSearch({
  stage,
  basePath,
  statut,
  defaultValue,
  placeholder = "Carton, dossier ou titulaire",
  hidden = {},
}: {
  stage: SuggestStage;
  basePath: string;
  statut: string;
  defaultValue?: string;
  placeholder?: string;
  hidden?: Record<string, string>;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue ?? "");
  const [result, setResult] = useState<Result>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);
  const items: Suggestion[] = [...result.cartons, ...result.dossiers];

  function query(text: string) {
    window.clearTimeout(timer.current);
    controller.current?.abort();
    if (text.trim().length < 2) {
      setResult(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      const abort = new AbortController();
      controller.current = abort;
      try {
        const response = await fetch(`/api/recherche/suggestions?stage=${stage}&q=${encodeURIComponent(text.trim())}`, { signal: abort.signal });
        if (!response.ok) throw new Error();
        setResult(await response.json() as Result);
        setActive(-1);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResult(EMPTY);
      } finally {
        if (controller.current === abort) setLoading(false);
      }
    }, 220);
  }

  function choose(item: Suggestion) {
    setOpen(false);
    setValue(item.reference);
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !items.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % items.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index <= 0 ? items.length - 1 : index - 1)); }
    else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(items[active]); }
  }

  const showPanel = open && value.trim().length >= 2;
  const optionId = (index: number) => `${listId}-${index}`;

  return (
    <form className="flex max-w-xl gap-2" action={basePath} method="get" onSubmit={() => setOpen(false)}>
      <input type="hidden" name="statut" value={statut} />
      {Object.entries(hidden).map(([name, val]) => <input key={name} type="hidden" name={name} value={val} />)}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          value={value}
          onChange={(event) => { setValue(event.target.value); query(event.target.value); }}
          onFocus={() => { if (items.length) setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className="pl-9 pr-9"
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
        {showPanel ? (
          <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[26rem] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
            {items.length === 0 && !loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Aucun carton ni dossier de cette file ne correspond à « {value.trim()} ».</p>
            ) : null}
            {result.approx && items.length ? <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Pas de correspondance exacte : résultats les plus proches.</p> : null}
            {result.cartons.length ? <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Cartons</p> : null}
            {result.cartons.map((carton, index) => (
              <Option key={`c${carton.cartonId}`} id={optionId(index)} active={active === index} onPick={() => choose(carton)} onHover={() => setActive(index)}>
                <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{carton.label ?? "Sans libellé"}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{carton.reference}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{carton.dossiers} dossier{carton.dossiers > 1 ? "s" : ""}</span>
              </Option>
            ))}
            {result.dossiers.length ? <p className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">Dossiers</p> : null}
            {result.dossiers.map((dossier, i) => {
              const index = result.cartons.length + i;
              return (
                <Option key={`d${dossier.id}`} id={optionId(index)} active={active === index} onPick={() => choose(dossier)} onHover={() => setActive(index)}>
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{dossier.titulaire ?? dossier.reference}</span>
                    <span className="block truncate text-xs text-muted-foreground"><span className="font-mono">{dossier.reference}</span>{dossier.carton ? ` · ${dossier.carton}` : ""}</span>
                  </span>
                </Option>
              );
            })}
          </div>
        ) : null}
      </div>
      <Button type="submit" variant="outline">Rechercher</Button>
    </form>
  );
}

function Option({ id, active, onPick, onHover, children }: { id: string; active: boolean; onPick: () => void; onHover: () => void; children: React.ReactNode }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(event) => { event.preventDefault(); onPick(); }}
      onMouseEnter={onHover}
      className={cn("flex cursor-pointer items-start gap-2.5 rounded-sm px-3 py-2", active && "bg-accent text-accent-foreground")}
    >
      {children}
    </div>
  );
}
