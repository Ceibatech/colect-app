"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface NatureDossier {
  id: number;
  libelle: string;
}

export function StepDossier({
  form,
  natures,
}: {
  form: UseFormReturn<DossierFormValues>;
  natures: NatureDossier[];
}) {
  const { control, formState } = form;
  const errors = formState.errors;

  return (
    <Field>
      <FieldLabel>Nature du dossier</FieldLabel>
      <FieldContent>
        <Controller
          control={control}
          name="natureDossierId"
          render={({ field }) => (
            <RadioGroup
              value={field.value ? String(field.value) : ""}
              onValueChange={(v) => field.onChange(Number(v))}
              className="gap-2"
            >
              {natures.map((n) => (
                <div key={n.id} className="flex items-center gap-2 rounded-md border p-2.5">
                  <RadioGroupItem value={String(n.id)} id={`nature-${n.id}`} />
                  <Label htmlFor={`nature-${n.id}`} className="font-normal">
                    {n.libelle}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError errors={[errors.natureDossierId]} />
      </FieldContent>
    </Field>
  );
}
