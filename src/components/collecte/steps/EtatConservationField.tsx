"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import { ETAT_CONSERVATION_OPTIONS, type DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * État physique (carton ou dossier) constaté à la collecte (Phase 15+) —
 * composant partagé entre StepIdentification.tsx (carton) et
 * StepDossier.tsx (dossier), même comportement pour les deux : deux options
 * fermées (Bon état / Dégradé), avec une description en texte libre qui
 * n'apparaît que si "Dégradé" est sélectionné — jamais imposée pour un bon
 * état, rien à décrire dans ce cas.
 */
export function EtatConservationField({
  form,
  label,
  etatField,
  descriptionField,
}: {
  form: UseFormReturn<DossierFormValues>;
  label: string;
  etatField: "etatCarton" | "etatDossier";
  descriptionField: "etatCartonDescription" | "etatDossierDescription";
}) {
  const { control, register, watch, formState } = form;
  const errors = formState.errors;
  const etat = watch(etatField);

  return (
    <Field className="sm:col-span-2">
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <Controller
          control={control}
          name={etatField}
          render={({ field }) => (
            <RadioGroup value={field.value ?? ""} onValueChange={field.onChange} className="flex flex-wrap gap-2">
              {ETAT_CONSERVATION_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2 rounded-md border p-2.5">
                  <RadioGroupItem value={o.value} id={`${etatField}-${o.value}`} />
                  <Label htmlFor={`${etatField}-${o.value}`} className="font-normal">
                    {o.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        <FieldError errors={[errors[etatField]]} />
        {etat === "DEGRADE" ? (
          <div className="mt-2 space-y-1">
            <Label htmlFor={descriptionField} className="text-xs text-muted-foreground">
              Description de l&apos;état
            </Label>
            <Textarea id={descriptionField} {...register(descriptionField)} rows={2} placeholder="Décrire l'état dégradé..." />
            <FieldError errors={[errors[descriptionField]]} />
          </div>
        ) : null}
      </FieldContent>
    </Field>
  );
}
