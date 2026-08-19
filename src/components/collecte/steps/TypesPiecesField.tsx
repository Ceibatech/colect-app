"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
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
 * en find-or-create (cf. resolveTypesPieceIds, dossier-service.ts), comme
 * "Autres" pour Lotissement/NatureDossier.
 */
const NEW_PREFIX = "new:";

/**
 * "Types de pièces dans le dossier" (Phase 18+) — liste fermée mais
 * extensible : cases à cocher pour les types déjà connus (référentiel
 * `types_piece`, administrable) + un champ pour ajouter un type absent de la
 * liste (badge retirable). Distinct du champ "Autres pièces" en saisie
 * libre (StepDossier.tsx), qui n'est jamais résolu en type catégorisé.
 */
export function TypesPiecesField({ form, typesPiece }: { form: UseFormReturn<DossierFormValues>; typesPiece: TypePieceOption[] }) {
  const { control, formState } = form;
  const errors = formState.errors;
  const [customInput, setCustomInput] = useState("");

  return (
    <Field className="sm:col-span-2">
      <FieldLabel>Types de pièces dans le dossier</FieldLabel>
      <FieldContent>
        <Controller
          control={control}
          name="typesPieces"
          render={({ field }) => {
            const selected: string[] = Array.isArray(field.value) ? field.value : [];
            const customs = selected.filter((v) => v.startsWith(NEW_PREFIX));

            const toggle = (token: string) => {
              field.onChange(selected.includes(token) ? selected.filter((v) => v !== token) : [...selected, token]);
            };

            const removeCustom = (token: string) => {
              field.onChange(selected.filter((v) => v !== token));
            };

            const addCustom = () => {
              const label = customInput.trim();
              if (!label) return;
              const alreadyCustom = customs.some((c) => c.slice(NEW_PREFIX.length).toLowerCase() === label.toLowerCase());
              const matchesExisting = typesPiece.some((t) => t.libelle.toLowerCase() === label.toLowerCase());
              if (!alreadyCustom && !matchesExisting) {
                field.onChange([...selected, `${NEW_PREFIX}${label}`]);
              }
              setCustomInput("");
            };

            return (
              <>
                <div className="flex flex-wrap gap-2">
                  {typesPiece.map((t) => {
                    const token = String(t.id);
                    const checked = selected.includes(token);
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
              </>
            );
          }}
        />
        <FieldError errors={[errors.typesPieces]} />
      </FieldContent>
    </Field>
  );
}
