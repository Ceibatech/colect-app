"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

export interface TypePieceOption {
  id: number;
  libelle: string;
}

/**
 * Préfixe d'interface pour un type de pièce ajouté à la volée, absent du
 * référentiel `types_piece` — jamais stocké tel quel : résolu côté serveur
 * en find-or-create (cf. resolveTypesPieceIds, workflow-service.ts), comme
 * "Autres" pour Lotissement/NatureDossier.
 */
const NEW_PREFIX = "new:";

/**
 * "Types de pièces dans le dossier" — liste fermée mais extensible : cases à
 * cocher pour les types déjà connus (référentiel `types_piece`,
 * administrable) + un champ pour ajouter un type absent de la liste (badge
 * retirable). Distinct du champ "Autres pièces" en saisie libre (resté dans
 * la Collecte, StepDossier.tsx), qui n'est jamais résolu en type catégorisé.
 *
 * Composant autonome (Phase 20+, déplacé de la Collecte vers l'étape
 * Préparation — cf. PreparationActions dans WorkflowActions.tsx) : contrôlé
 * en `value`/`onChange` plutôt que lié à un formulaire react-hook-form
 * précis, pour rester réutilisable.
 */
export function TypesPiecesField({
  value,
  onChange,
  typesPiece,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  typesPiece: TypePieceOption[];
  error?: string;
}) {
  const [customInput, setCustomInput] = useState("");
  const customs = value.filter((v) => v.startsWith(NEW_PREFIX));

  const toggle = (token: string) => {
    onChange(value.includes(token) ? value.filter((v) => v !== token) : [...value, token]);
  };

  const removeCustom = (token: string) => {
    onChange(value.filter((v) => v !== token));
  };

  const addCustom = () => {
    const label = customInput.trim();
    if (!label) return;
    const alreadyCustom = customs.some((c) => c.slice(NEW_PREFIX.length).toLowerCase() === label.toLowerCase());
    const matchesExisting = typesPiece.some((t) => t.libelle.toLowerCase() === label.toLowerCase());
    if (!alreadyCustom && !matchesExisting) {
      onChange([...value, `${NEW_PREFIX}${label}`]);
    }
    setCustomInput("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {typesPiece.map((t) => {
          const token = String(t.id);
          const checked = value.includes(token);
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-md border p-2.5">
              <Checkbox id={`type-piece-${t.id}`} checked={checked} onCheckedChange={() => toggle(token)} />
              <Label htmlFor={`type-piece-${t.id}`} className="font-normal">
                {t.libelle}
              </Label>
            </div>
          );
        })}
      </div>

      {customs.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {customs.map((token) => {
            const label = token.slice(NEW_PREFIX.length);
            return (
              <Badge key={token} variant="secondary" className="gap-1">
                {label}
                <button type="button" onClick={() => removeCustom(token)} aria-label={`Retirer ${label}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Ajouter une pièce absente de la liste..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addCustom}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
