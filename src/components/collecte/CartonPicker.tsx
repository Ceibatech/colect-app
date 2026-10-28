"use client";

import { useRef, useState } from "react";
import { Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { coteFromScan } from "@/lib/cartons/scan";
import { cn } from "@/lib/utils";

type Option = { cote: string; libelle: string | null; dossiers: number; site: string | null };

/**
 * Choix du carton auquel ajouter le dossier : cote scannée ou saisie, ou
 * recherche par libellé. Le dossier prendra le n° suivant du carton.
 */
export function CartonPicker({ value, onChange, siteId }: { value: string; onChange: (cote: string) => void; siteId?: number }) {
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<number | undefined>(undefined);

  function search(text: string) {
    window.clearTimeout(timer.current);
    if (text.trim().length < 2 || coteFromScan(text)) { setOptions([]); return; }
    timer.current = window.setTimeout(async () => {
      const response = await fetch(`/api/cartons/choix?q=${encodeURIComponent(text.trim())}${siteId ? `&site=${siteId}` : ""}`).catch(() => null);
      const body = response?.ok ? await response.json() as { cartons: Option[] } : { cartons: [] };
      setOptions(body.cartons);
      setActive(-1);
      setOpen(true);
    }, 250);
  }

  function pick(option: Option) {
    onChange(option.cote);
    setOpen(false);
    setOptions([]);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(event) => { onChange(event.target.value); search(event.target.value); }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 150); const cote = coteFromScan(value); if (cote && cote !== value) onChange(cote); }}
        onKeyDown={(event) => {
          if (!open || !options.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % options.length); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i <= 0 ? options.length - 1 : i - 1)); }
          else if (event.key === "Enter" && active >= 0) { event.preventDefault(); pick(options[active]); }
          else if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Scannez le QR, saisissez la cote (2010-KOU-0001) ou le libellé. Vide : nouveau carton"
        autoComplete="off"
        className="font-mono"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-label="Carton auquel ajouter le dossier"
      />
      {open && options.length ? (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
          {options.map((option, index) => (
            <div
              key={option.cote}
              role="option"
              aria-selected={active === index}
              onMouseDown={(event) => { event.preventDefault(); pick(option); }}
              onMouseEnter={() => setActive(index)}
              className={cn("flex cursor-pointer items-start gap-2.5 rounded-sm px-3 py-2", active === index && "bg-accent")}
            >
              <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-sm font-semibold">{option.cote}</span>
                <span className="block truncate text-xs text-muted-foreground">{[option.libelle ?? "Sans libellé", option.site].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{option.dossiers} dossier{option.dossiers > 1 ? "s" : ""} → n° {String(option.dossiers + 1).padStart(3, "0")}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
