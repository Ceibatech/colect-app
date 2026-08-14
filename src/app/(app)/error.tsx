"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Error boundary partagée sous `(app)/` (Phase 14, §94) : une erreur
 * inattendue dans un Server Component (dashboard, dossiers, qualité, etc.)
 * affichait jusqu'ici la page d'erreur générique de Next.js (pile technique
 * visible, aucune action de récupération). Ce composant intercepte l'erreur,
 * la journalise côté client (jamais son détail technique affiché à
 * l'utilisateur — cohérent avec `apiErrorResponse()` côté API, cf.
 * SECURITY.md) et propose de réessayer sans recharger toute l'application.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Alert variant="destructive" className="max-w-md">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Une erreur est survenue</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Le chargement de cette page a échoué. Vous pouvez réessayer ; si le problème persiste, contactez
            l&apos;administrateur.
          </p>
          <Button size="sm" variant="outline" onClick={reset}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
