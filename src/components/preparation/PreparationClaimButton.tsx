"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function PreparationClaimButton({ dossierId }: { dossierId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function claim() {
    setPending(true);
    try {
      const response = await fetch(`/api/dossiers/${dossierId}/prepare/claim`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Impossible de prendre en charge ce dossier.");
      router.push(`/dossiers/${dossierId}?tab=preparation&from=preparation`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de prendre en charge ce dossier.");
      setPending(false);
    }
  }

  return (
    <Button size="sm" disabled={pending} onClick={claim}>
      {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1 h-4 w-4" />}
      Prendre en charge
    </Button>
  );
}
