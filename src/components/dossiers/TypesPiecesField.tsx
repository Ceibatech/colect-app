"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Sparkles, X } from "lucide-react";
import {
  canonicalizeTypePieceLabel,
  getTypePieceMatchKey,
  getTypePieceSuggestionScore,
} from "@/lib/utils/type-piece-normalization";

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
  const canonicalInput = canonicalizeTypePieceLabel(customInput);
  const inputKey = getTypePieceMatchKey(customInput);
  const suggestions = useMemo(() => {
    if (!customInput.trim()) return [];
    return typesPiece
      .map((type) => ({ type, score: getTypePieceSuggestionScore(customInput, type.libelle) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.type.libelle.localeCompare(b.type.libelle, "fr"))
      .slice(0, 4)
      .map(({ type }) => type);
  }, [customInput, typesPiece]);
  const matchingExisting = inputKey
    ? typesPiece.find((type) => getTypePieceMatchKey(type.libelle) === inputKey)
    : undefined;

  const toggle = (token: string) => {
    onChange(value.includes(token) ? value.filter((v) => v !== token) : [...value, token]);
  };

  const removeCustom = (token: string) => {
    onChange(value.filter((v) => v !== token));
  };

  const selectExisting = (id: number) => {
    const token = String(id);
    if (!value.includes(token)) onChange([...value, token]);
    setCustomInput("");
  };

  const addCustom = () => {
    const label = canonicalInput;
    if (!label) return;
    if (matchingExisting) {
      selectExisting(matchingExisting.id);
      return;
    }

    const labelKey = getTypePieceMatchKey(label);
    const alreadyCustom = customs.some(
      (token) => getTypePieceMatchKey(token.slice(NEW_PREFIX.length)) === labelKey,
    );
    if (!alreadyCustom) {
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

      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Rechercher ou ajouter une pièce..."
            aria-label="Rechercher ou ajouter un type de pièce"
            aria-expanded={suggestions.length > 0}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          {customInput.trim() ? (
            <div className="mt-1 overflow-hidden rounded-md border bg-background shadow-sm">
              {suggestions.map((suggestion) => {
                const selected = value.includes(String(suggestion.id));
                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => selectExisting(suggestion.id)}
                  >
                    <span>{suggestion.libelle}</span>
                    {selected ? (
                      <span className="flex items-center gap-1 text-xs text-primary">
                        <Check className="h-3.5 w-3.5" /> Sélectionné
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {!matchingExisting && canonicalInput ? (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  onClick={addCustom}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ajouter au référentiel : {canonicalInput}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addCustom}>
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Les abréviations et variantes sont harmonisées automatiquement. Toute nouvelle pièce récurrente
        rejoindra cette liste de propositions.
      </p>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
