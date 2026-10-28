"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { QrCameraScanner } from "@/components/cartons/QrCameraScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Mise en caisse : scanner (douchette ou appareil photo) ou saisir la cote de
 * chaque carton. L'application refuse un carton non reconditionné, déjà rangé
 * ailleurs, ou une caisse pleine.
 */
export function CaisseRangement({ caisseId, numero }: { caisseId: number; numero: string }) {
  const router = useRouter();
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  const last = useRef("");

  async function ranger(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/caisses/${caisseId}/cartons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan: value }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; cote?: string; dejaRange?: boolean; occupes?: number; capacite?: number };
      if (!response.ok) throw new Error(body.error ?? "Rangement impossible.");
      if (body.dejaRange) toast.info(`${body.cote} est déjà dans la caisse ${numero}.`);
      else toast.success(`${body.cote} rangé dans ${numero} (${body.occupes}/${body.capacite}).`);
      setScan("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rangement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => { event.preventDefault(); void ranger(scan); }} className="flex gap-2">
        <Input value={scan} onChange={(event) => setScan(event.target.value)} placeholder="Scannez le QR du carton ou saisissez sa cote (2010-KOU-0001)" className="h-11 font-mono text-base" aria-label="Carton à ranger" autoComplete="off" autoFocus />
        <Button type="submit" className="h-11" disabled={busy || !scan.trim()}>{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />} Ranger</Button>
      </form>
      <QrCameraScanner onCode={(text) => { if (text !== last.current) { last.current = text; void ranger(text); window.setTimeout(() => { last.current = ""; }, 3000); } }} />
    </div>
  );
}

export function RetirerCarton({ caisseId, cartonId, cote }: { caisseId: number; cartonId: number; cote: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function retirer() {
    if (!window.confirm(`Retirer ${cote} de la caisse ?`)) return;
    setBusy(true);
    const response = await fetch(`/api/caisses/${caisseId}/cartons/${cartonId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { toast.error(body.error ?? "Retrait impossible."); return; }
    toast.success(`${cote} retiré de la caisse.`);
    router.refresh();
  }
  return <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void retirer()}>Retirer</Button>;
}
