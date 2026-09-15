"use client";

import type { UseFormReturn } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * "Nombre de pages" (Phase 15+) a été retiré d'ici en Phase 20+ : il
 * constitue désormais, avec Nombre/Types de pièces, la nouvelle étape
 * "Préparation" (cf. StepDossier.tsx et PreparationActions dans
 * WorkflowActions.tsx).
 */
export function StepSuivi({ form }: { form: UseFormReturn<DossierFormValues> }) {
  const { register, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4">
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
