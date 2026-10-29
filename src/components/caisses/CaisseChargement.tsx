"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { QrCameraScanner } from "@/components/cartons/QrCameraScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Chargement : scanner (douchette ou appareil photo) ou saisir la cote de
 * chaque carton du lot. L'application refuse un carton hors lot, déjà dans une
 * autre conteneur, un carton d'un autre lot que celui du conteneur, ou un conteneur plein.
 */
export function CaisseChargement({ caisseId, numero }: { caisseId: number; numero: string }) {
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
      const body = await response.json().catch(() => ({})) as { error?: string; cote?: string; dejaCharge?: boolean; occupes?: number; capacite?: number; lot?: string };
      if (!response.ok) throw new Error(body.error ?? "Chargement impossible.");
      if (body.dejaCharge) toast.info(`${body.cote} est déjà dans le conteneur ${numero}.`);
      else toast.success(`${body.cote} chargé dans ${numero} (${body.occupes}/${body.capacite}) · lot ${body.lot}.`);
      setScan("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => { event.preventDefault(); void ranger(scan); }} className="flex gap-2">
        <Input value={scan} onChange={(event) => setScan(event.target.value)} placeholder="Scannez le QR du carton ou saisissez sa cote (2010-KOU-0001)" className="h-11 font-mono text-base" aria-label="Carton à charger" autoComplete="off" autoFocus />
        <Button type="submit" className="h-11" disabled={busy || !scan.trim()}>{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />} Charger</Button>
      </form>
      <QrCameraScanner onCode={(text) => { if (text !== last.current) { last.current = text; void ranger(text); window.setTimeout(() => { last.current = ""; }, 3000); } }} />
    </div>
  );
}

export function RetirerCarton({ caisseId, cartonId, cote }: { caisseId: number; cartonId: number; cote: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function retirer() {
    if (!window.confirm(`Retirer ${cote} du conteneur ?`)) return;
    setBusy(true);
    const response = await fetch(`/api/caisses/${caisseId}/cartons/${cartonId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!response.ok) { toast.error(body.error ?? "Retrait impossible."); return; }
    toast.success(`${cote} retiré du conteneur.`);
    router.refresh();
  }
  return <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void retirer()}>Retirer</Button>;
}
