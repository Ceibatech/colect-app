"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Operateur {
  id: number;
  nom: string;
  prenoms: string | null;
  matricule: string;
}

export function StepIdentification({
  form,
  operateurs,
  isOperateurRole,
  currentUserName,
}: {
  form: UseFormReturn<DossierFormValues>;
  operateurs: Operateur[];
  isOperateurRole: boolean;
  currentUserName: string;
}) {
  const { register, control, formState } = form;
  const errors = formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field className="sm:col-span-2">
        <FieldLabel>Opérateur</FieldLabel>
        <FieldContent>
          {isOperateurRole ? (
            <Input value={currentUserName} disabled readOnly />
          ) : (
            <Controller
              control={control}
              name="operateurId"
              render={({ field }) => (
                <Select
                  items={operateurs.map((op) => ({ label: `${op.nom} ${op.prenoms ?? ""} (${op.matricule})`, value: op.id }))}
                  value={field.value ?? null}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sélectionner l'opérateur ayant réalisé la collecte" />
                  </SelectTrigger>
                  <SelectContent>
                    {operateurs.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.nom} {op.prenoms ?? ""} ({op.matricule})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
          <FieldError errors={[errors.operateurId]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Libellé du carton</FieldLabel>
        <FieldContent>
          <Input {...register("libelleCarton")} placeholder="Ex. Carton A-12" />
          <FieldError errors={[errors.libelleCarton]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Code-barres</FieldLabel>
        <FieldContent>
          <Input {...register("codeBarres")} placeholder="Code-barres du carton" />
          <FieldError errors={[errors.codeBarres]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>N° guichet</FieldLabel>
        <FieldContent>
          <Input {...register("numeroGuichet")} />
          <FieldError errors={[errors.numeroGuichet]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>N° DDU</FieldLabel>
        <FieldContent>
          <Input {...register("numeroDdu")} />
          <FieldError errors={[errors.numeroDdu]} />
        </FieldContent>
      </Field>

      <Field className="sm:col-span-2">
        <FieldLabel>Référence de classement</FieldLabel>
        <FieldContent>
          <Input {...register("referenceClassement")} />
          <FieldError errors={[errors.referenceClassement]} />
        </FieldContent>
      </Field>
    </div>
  );
}
