"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScanSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runQualityScan } from "@/lib/services/quality-service";

export function QualityScanButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const result = await runQualityScan();
        toast.success(
          `Analyse actualisée : ${result.dossiersScanned} dossier(s) contrôlé(s), ${result.anomaliesCreated} nouvelle(s) alerte(s).`
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors du contrôle qualité.");
      }
    });
  }

  return (
    <Button onClick={run} disabled={isPending} size="lg" className="h-10 shadow-sm">
      {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanSearch className="mr-1 h-4 w-4" />}
      Actualiser l&apos;analyse
    </Button>
  );
}