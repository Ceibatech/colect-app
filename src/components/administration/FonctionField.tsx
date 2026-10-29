"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FONCTIONS } from "@/lib/users/fonctions";

const AUTRE = "__autre__";

/** Fonction choisie dans une liste ; « Autre » ouvre un champ libre. */
export function FonctionField({ id, defaultValue, disabled }: { id: string; defaultValue?: string | null; disabled?: boolean }) {
  const initial = defaultValue?.trim() ?? "";
  const known = (FONCTIONS as readonly string[]).includes(initial);
  const [choice, setChoice] = useState(initial === "" ? "" : known ? initial : AUTRE);
  const [other, setOther] = useState(known ? "" : initial);
  const value = choice === AUTRE ? other : choice;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Fonction</Label>
      <input type="hidden" name="fonction" value={value} />
      <select id={id} value={choice} onChange={(event) => setChoice(event.target.value)} disabled={disabled} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
        <option value="">Non renseignée (le rôle sera imprimé)</option>
        {FONCTIONS.map((fonction) => <option key={fonction} value={fonction}>{fonction}</option>)}
        <option value={AUTRE}>Autre (préciser)</option>
      </select>
      {choice === AUTRE ? <Input aria-label="Préciser la fonction" value={other} onChange={(event) => setOther(event.target.value)} maxLength={120} placeholder="Ex. Chef du bureau courrier" disabled={disabled} /> : null}
      <p className="text-xs text-muted-foreground">Reprise automatiquement sous son nom à chaque signature.</p>
    </div>
  );
}
