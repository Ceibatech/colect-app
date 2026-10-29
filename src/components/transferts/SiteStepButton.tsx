"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PackageCheck, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const LABELS = {
  "chargement-debut": { button: "Début du chargement", done: "Début du chargement enregistré." },
  "chargement-fin": { button: "Fin du chargement", done: "Chargement terminé : le convoyeur est prévenu." },
  "dechargement-debut": { button: "Début du déchargement", done: "Début du déchargement enregistré." },
  "dechargement-fin": { button: "Fin du déchargement", done: "Déchargement terminé : signez l'état des lieux (F03)." },
} as const;

export type SiteStep = keyof typeof LABELS;

/** Le responsable de site horodate le chargement ou le déchargement d'un appui. */
export function SiteStepButton({ lotId, step }: { lotId: number; step: SiteStep }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = LABELS[step];

  async function record() {
    setBusy(true);
    try {
      const response = await fetch(`/api/transferts/${lotId}/etapes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etape: step }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Étape non enregistrée.");
      toast.success(label.done);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Étape non enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = step.endsWith("fin") ? PackageCheck : PackageOpen;
  return <Button onClick={() => void record()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Icon />} {label.button}</Button>;
}
