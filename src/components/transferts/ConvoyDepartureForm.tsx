"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Navigation } from "lucide-react";
import { toast } from "sonner";
import { QrCameraScanner } from "@/components/cartons/QrCameraScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cartonIdFromScan, coteFromScan } from "@/lib/cartons/scan";

export type LoadedCarton = { id: number; cartonId: number | null; code: string; ctn: string | null; label: string | null; dossiers: number };

function currentPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 });
  });
}

/**
 * Fiche de départ du convoyeur : véhicule, contrôle des cartons chargés
 * (scan du QR code ou coche), scellés. « Démarrer le trajet » enregistre la
 * fiche, prévient les deux sites et lance le suivi.
 */
export function ConvoyDepartureForm({
  lotId,
  cartons,
  prefill,
}: {
  lotId: number;
  cartons: LoadedCarton[];
  prefill: { vehicleRegistration: string; driverName: string; driverPhone: string; sealReferences: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(prefill);
  const [checked, setChecked] = useState<number[]>([]);
  const [scan, setScan] = useState("");
  const [missingNote, setMissingNote] = useState("");
  const [busy, setBusy] = useState(false);
  const missing = cartons.filter((carton) => !checked.includes(carton.id));
  const ready = form.vehicleRegistration.trim().length >= 2 && form.driverName.trim().length >= 2 && (missing.length === 0 || missingNote.trim().length > 0);

  function check(id: number, on = true) {
    setChecked((current) => (on ? [...new Set([...current, id])] : current.filter((value) => value !== id)));
  }

  function handleScan(text: string) {
    const cartonId = cartonIdFromScan(text);
    const cote = coteFromScan(text);
    const value = text.trim().toLowerCase();
    const found = cartons.find((carton) => (cartonId !== null && carton.cartonId === cartonId)
      || (cote !== null && carton.code === cote)
      || carton.code.toLowerCase() === value);
    if (!found) {
      toast.error(cartonId || cote ? "Ce carton ne fait pas partie de ce lot." : "QR code non reconnu.");
      return;
    }
    if (checked.includes(found.id)) {
      toast.info(`${found.code} déjà contrôlé.`);
      return;
    }
    check(found.id);
    toast.success(`${found.code} contrôlé.`);
  }

  async function start() {
    setBusy(true);
    try {
      const position = await currentPosition();
      const response = await fetch(`/api/transferts/${lotId}/convoi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "depart",
          latitude: position?.coords.latitude,
          longitude: position?.coords.longitude,
          departure: {
            vehicleRegistration: form.vehicleRegistration,
            driverName: form.driverName,
            driverPhone: form.driverPhone || undefined,
            sealReferences: form.sealReferences || undefined,
            checkedItemIds: checked,
            missingNote: missing.length ? missingNote : undefined,
          },
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Impossible de démarrer le trajet.");
      toast.success("Trajet démarré : les deux sites sont prévenus.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de démarrer le trajet.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${lotId}-${key}`}>{label}</Label>
      <Input id={`${lotId}-${key}`} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="h-11 text-base" {...props} />
    </div>
  );

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Avant le départ</h3>
        <p className="text-sm text-muted-foreground">Vérifiez le véhicule, contrôlez chaque carton chargé, puis démarrez le trajet.</p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">1. Véhicule</legend>
        {field("vehicleRegistration", "Immatriculation", { autoCapitalize: "characters" })}
        {field("driverName", "Chauffeur")}
        {field("driverPhone", "Téléphone du chauffeur", { type: "tel", inputMode: "tel" })}
        {field("sealReferences", "Scellés posés", { placeholder: "Numéros séparés par des virgules" })}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">2. Cartons chargés : {checked.length}/{cartons.length} contrôlés</legend>
        <QrCameraScanner onCode={handleScan} />
        <form
          onSubmit={(event) => { event.preventDefault(); if (scan.trim()) { handleScan(scan); setScan(""); } }}
          className="flex gap-2"
        >
          <Input value={scan} onChange={(event) => setScan(event.target.value)} placeholder="Douchette ou saisie : 2010-KOU-0001" className="h-11 text-base" aria-label="Scanner un carton" autoComplete="off" />
          <Button type="submit" variant="outline" className="h-11">Valider</Button>
        </form>
        <ul className="divide-y rounded-md border">
          {cartons.map((carton) => {
            const ok = checked.includes(carton.id);
            return (
              <li key={carton.id}>
                <button type="button" onClick={() => check(carton.id, !ok)} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left">
                  {ok ? <CheckCircle2 className="size-5 shrink-0 text-brand-green" /> : <Circle className="size-5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-sm font-semibold">{carton.code}</span>
                    <span className="block truncate text-xs text-muted-foreground">{carton.label ?? "Sans libellé"} · {carton.dossiers} dossier{carton.dossiers > 1 ? "s" : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {missing.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor={`${lotId}-missing`}>{missing.length} carton{missing.length > 1 ? "s" : ""} non contrôlé{missing.length > 1 ? "s" : ""} : pourquoi ?</Label>
            <Textarea id={`${lotId}-missing`} value={missingNote} onChange={(event) => setMissingNote(event.target.value)} rows={2} placeholder="Ex. étiquette QR absente, carton vérifié à la main" />
          </div>
        ) : null}
      </fieldset>

      <Button className="h-12 w-full text-base" disabled={!ready || busy} onClick={() => void start()}>
        {busy ? <Loader2 className="animate-spin" /> : <Navigation />} 3. Démarrer le trajet
      </Button>
    </div>
  );
}
