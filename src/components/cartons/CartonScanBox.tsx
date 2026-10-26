"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cartonIdFromScan } from "@/lib/cartons/scan";
import { formatCartonReference } from "@/lib/cartons/reference";

/**
 * Champ de lecture : une douchette « tape » le contenu du QR code puis Entrée.
 * Un QR code ouvre directement la fiche du carton ; un autre texte lance une
 * recherche par libellé ou code-barres.
 */
export function CartonScanBox({ defaultValue = "" }: { defaultValue?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    const id = cartonIdFromScan(text);
    if (id) {
      setValue("");
      router.push(`/cartons/${formatCartonReference(id)}`);
      return;
    }
    router.push(`/cartons?q=${encodeURIComponent(text)}`);
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl gap-2" role="search">
      <div className="relative flex-1">
        <QrCode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={input}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 pl-9 text-base"
          placeholder="Scanner le QR code, ou saisir CTN, libellé ou code-barres"
          aria-label="Scanner ou rechercher un carton"
          autoComplete="off"
        />
      </div>
      <Button type="submit" className="h-11">Ouvrir</Button>
    </form>
  );
}
