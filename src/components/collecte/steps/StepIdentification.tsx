"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import { DIRECTION_SERVICE_OPTIONS, type DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Sentinelle d'interface uniquement — jamais stockée (cf. dossier.ts). */
const AUTRES = "__AUTRES__";

const DIRECTION_SERVICE_ITEMS = [
  ...DIRECTION_SERVICE_OPTIONS.map((code) => ({ label: code, value: code })),
  { label: "Autres (préciser)", value: AUTRES },
];

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

      <DirectionServiceField form={form} />

      <Field>
        <FieldLabel>Numéro Direction/Service</FieldLabel>
        <FieldContent>
          <Input {...register("numeroDirectionService")} />
          <FieldError errors={[errors.numeroDirectionService]} />
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

/**
 * Direction/Service concerné(e) (anciennement "N° DDU") : liste fermée
 * (DIRECTION_SERVICE_OPTIONS) + "Autres" qui bascule vers une saisie libre.
 * L'état local `autres` ne stocke rien lui-même — il pilote seulement
 * l'affichage ; la valeur réelle reste entièrement dans `numeroDdu` (form
 * React Hook Form), y compris en mode "Autres". Réinitialisé à chaque
 * montage à partir de la valeur courante du formulaire : robuste au
 * démontage/remontage de cette étape quand on navigue entre les étapes du
 * wizard (CollecteWizard ne garde que l'étape active montée).
 */
function DirectionServiceField({ form }: { form: UseFormReturn<DossierFormValues> }) {
  const { control, formState } = form;
  const errors = formState.errors;
  const [autres, setAutres] = useState(() => {
    const current = form.getValues("numeroDdu");
    return !!current && !(DIRECTION_SERVICE_OPTIONS as readonly string[]).includes(current);
  });

  return (
    <Field>
      <FieldLabel>Direction/Service concerné(e)</FieldLabel>
      <FieldContent>
        <Controller
          control={control}
          name="numeroDdu"
          render={({ field }) => (
            <>
              <Select
                items={DIRECTION_SERVICE_ITEMS}
                value={autres ? AUTRES : field.value || null}
                onValueChange={(value) => {
                  if (value === AUTRES) {
                    setAutres(true);
                    field.onChange("");
                  } else {
                    setAutres(false);
                    field.onChange(value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner une direction/service" />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_SERVICE_ITEMS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autres ? (
                <Input
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  placeholder="Préciser la direction/service"
                  className="mt-2"
                  autoFocus
                />
              ) : null}
            </>
          )}
        />
        <FieldError errors={[errors.numeroDdu]} />
      </FieldContent>
    </Field>
  );
}
