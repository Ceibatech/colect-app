"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EtatConservationField } from "./EtatConservationField";

interface NatureDossier {
  id: number;
  libelle: string;
}

/** Sentinelle d'interface uniquement — jamais stockée (résolue côté serveur). */
const AUTRES = "__AUTRES__";

/**
 * "Nombre de pièces" et "Types de pièces" (Phase 18+) ont été retirés d'ici
 * en Phase 20+ : ils constituent désormais la nouvelle étape "Préparation"
 * (entre Validation et Numérisation, cf. PreparationActions dans
 * WorkflowActions.tsx), plutôt que d'être saisis dès la Collecte —
 * l'opérateur ne connaît pas toujours ces informations sur le terrain, avant
 * même que le dossier soit validé.
 */
export function StepDossier({
  form,
  natures,
}: {
  form: UseFormReturn<DossierFormValues>;
  natures: NatureDossier[];
}) {
  const { register, control, formState, setValue } = form;
  const errors = formState.errors;

  const items = [...natures.map((n) => ({ label: n.libelle, value: String(n.id) })), { label: "Autres (préciser)", value: AUTRES }];

  const [autres, setAutres] = useState(() => !form.getValues("natureDossierId") && !!form.getValues("natureDossierAutre"));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel>Nature du dossier</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="natureDossierId"
            render={({ field }) => (
              <>
                <Select
                  items={items}
                  value={autres ? AUTRES : field.value ? String(field.value) : null}
                  onValueChange={(value) => {
                    if (value === AUTRES) {
                      setAutres(true);
                      field.onChange(undefined);
                    } else {
                      setAutres(false);
                      setValue("natureDossierAutre", "");
                      field.onChange(Number(value));
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner une nature de dossier" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {autres ? (
                  <Input {...register("natureDossierAutre")} placeholder="Préciser la nature du dossier" className="mt-2" autoFocus />
                ) : null}
              </>
            )}
          />
          <FieldError errors={[errors.natureDossierId, errors.natureDossierAutre]} />
        </FieldContent>
      </Field>

      <EtatConservationField form={form} label="État du dossier" etatField="etatDossier" descriptionField="etatDossierDescription" />

      <Field className="sm:col-span-2">
        <FieldLabel>Autres pièces</FieldLabel>
        <FieldContent>
          <Textarea {...register("autresPieces")} rows={2} placeholder="Préciser toute autre pièce non listée ci-dessus..." />
          <FieldError errors={[errors.autresPieces]} />
        </FieldContent>
      </Field>
    </div>
  );
}
