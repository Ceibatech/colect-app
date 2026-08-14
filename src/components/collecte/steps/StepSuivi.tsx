"use client";

import type { UseFormReturn } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StepSuivi({ form }: { form: UseFormReturn<DossierFormValues> }) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel>Nombre de pages</FieldLabel>
        <FieldContent>
          <Input type="number" min="1" step="1" {...register("nombrePages")} />
          <FieldDescription>Estimation du nombre de pages du dossier physique.</FieldDescription>
          <FieldError errors={[errors.nombrePages]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Observations</FieldLabel>
        <FieldContent>
          <Textarea rows={4} {...register("observations")} placeholder="Remarques éventuelles sur ce dossier" />
          <FieldError errors={[errors.observations]} />
        </FieldContent>
      </Field>
    </div>
  );
}
