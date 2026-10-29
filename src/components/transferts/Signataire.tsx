"use client";

import { createContext, useContext } from "react";
import { UserRoundCheck } from "lucide-react";

type Signataire = { name: string; title: string };

const SignataireContext = createContext<Signataire | null>(null);

export function SignataireProvider({ value, children }: { value: Signataire; children: React.ReactNode }) {
  return <SignataireContext.Provider value={value}>{children}</SignataireContext.Provider>;
}

/**
 * Identité du signataire, reprise du compte connecté : le nom et la fonction ne
 * se saisissent plus, seule la signature est apposée.
 */
export function SignataireIdentite() {
  const signataire = useContext(SignataireContext);
  if (!signataire) return null;
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-medium">{signataire.name}</p>
        <p className="text-sm text-muted-foreground">{signataire.title}</p>
        <p className="text-xs text-muted-foreground">Nom et fonction repris de votre compte. Une erreur ? L&apos;administrateur la corrige dans Utilisateurs.</p>
      </div>
    </div>
  );
}
