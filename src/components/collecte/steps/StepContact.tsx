"use client";

import type { UseFormReturn } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function StepContact({ form }: { form: UseFormReturn<DossierFormValues> }) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel>Personne à contacter</FieldLabel>
        <FieldContent>
          <Input {...register("personneContact")} />
          <FieldError errors={[errors.personneContact]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Mobile</FieldLabel>
        <FieldContent>
          <Input type="tel" {...register("mobile")} />
          <FieldError errors={[errors.mobile]} />
        </FieldContent>
      </Field>
    </div>
  );
}
