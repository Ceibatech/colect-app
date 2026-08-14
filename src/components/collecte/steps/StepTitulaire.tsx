"use client";

import type { UseFormReturn } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StepTitulaire({ form }: { form: UseFormReturn<DossierFormValues> }) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel>Nom</FieldLabel>
        <FieldContent>
          <Input {...register("nom")} />
          <FieldError errors={[errors.nom]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Prénoms</FieldLabel>
        <FieldContent>
          <Input {...register("prenoms")} />
          <FieldError errors={[errors.prenoms]} />
        </FieldContent>
      </Field>

      <Field className="sm:col-span-2">
        <FieldLabel>Adresse</FieldLabel>
        <FieldContent>
          <Textarea rows={2} {...register("adresse")} />
          <FieldError errors={[errors.adresse]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Téléphone</FieldLabel>
        <FieldContent>
          <Input type="tel" {...register("telephone")} />
          <FieldError errors={[errors.telephone]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>E-mail</FieldLabel>
        <FieldContent>
          <Input type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </FieldContent>
      </Field>
    </div>
  );
}
