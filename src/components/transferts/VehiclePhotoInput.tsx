"use client";

import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const MAX_SIDE = 1600;

/** Réduit la photo dans le navigateur (1600 px, JPEG) : quelques centaines de Ko au lieu de plusieurs Mo. */
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

/**
 * Photo du véhicule prise avec le téléphone (plaque visible) : elle remplace la
 * saisie de l'immatriculation et de la description du véhicule.
 */
export function VehiclePhotoInput({ name, disabled, onChange }: { name: string; disabled?: boolean; onChange?: (hasPhoto: boolean) => void }) {
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compress(file);
      setPhoto(data);
      onChange?.(true);
    } catch {
      toast.error("Photo illisible : reprenez-la.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setPhoto("");
    onChange?.(false);
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={photo} />
      {photo ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu en data URL */}
          <img src={photo} alt="Photo du véhicule" className="h-28 w-44 rounded-md border object-cover" />
          <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={disabled}><X /> Retirer</Button>
        </div>
      ) : null}
      <label className="inline-flex">
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabled || busy} onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ""; }} />
        <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {photo ? "Reprendre la photo" : "Photographier le véhicule"}
        </span>
      </label>
      <p className="text-xs text-muted-foreground">Plaque d&apos;immatriculation visible : la photo dispense de saisir l&apos;immatriculation et la description.</p>
    </div>
  );
}
