"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CommuneWithLotissements {
  id: number;
  nom: string;
  lotissements: { id: number; nom: string }[];
}

export function StepFoncier({
  form,
  communes,
}: {
  form: UseFormReturn<DossierFormValues>;
  communes: CommuneWithLotissements[];
}) {
  const { register, control, watch, setValue, formState } = form;
  const errors = formState.errors;
  const sansTitreFoncier = watch("sansTitreFoncier");
  const communeId = watch("communeId");
  const selectedCommune = communes.find((c) => c.id === communeId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Référentiel MULCV, série 2000 : îlot, lot, superficie, année, titre foncier, commune et lotissement sont exigés pour soumettre le dossier.
      </p>

      <Field>
        <FieldLabel>N° îlot</FieldLabel>
        <FieldContent>
          <Input {...register("numeroIlot")} />
          <FieldError errors={[errors.numeroIlot]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>N° lot</FieldLabel>
        <FieldContent>
          <Input {...register("numeroLot")} />
          <FieldError errors={[errors.numeroLot]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Superficie (m²)</FieldLabel>
        <FieldContent>
          <Input type="number" step="0.01" min="0" {...register("superficie")} />
          <FieldError errors={[errors.superficie]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Année de l&apos;acte</FieldLabel>
        <FieldContent>
          <Input type="number" inputMode="numeric" min={1900} max={new Date().getFullYear()} placeholder="Ex. 1998" {...register("anneeActe")} />
          <FieldError errors={[errors.anneeActe]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>N° titre foncier</FieldLabel>
        <FieldContent>
          <Input {...register("numeroTitreFoncier")} disabled={sansTitreFoncier === true} placeholder={sansTitreFoncier ? "Pas de titre foncier" : undefined} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={sansTitreFoncier === true}
              onChange={(event) => {
                setValue("sansTitreFoncier", event.target.checked, { shouldDirty: true });
                if (event.target.checked) setValue("numeroTitreFoncier", "");
                form.clearErrors("numeroTitreFoncier");
              }}
            />
            Pas de titre foncier sur ce dossier
          </label>
          <FieldError errors={[errors.numeroTitreFoncier]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Commune</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="communeId"
            render={({ field }) => (
              <Select
                items={communes.map((c) => ({ label: c.nom, value: c.id }))}
                value={field.value ?? null}
                onValueChange={(value) => {
                  field.onChange(value);
                  setValue("lotissementNom", "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner une commune" />
                </SelectTrigger>
                <SelectContent>
                  {communes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.communeId]} />
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Lotissement</FieldLabel>
        <FieldContent>
          <Input
            {...register("lotissementNom")}
            list="lotissements-datalist"
            disabled={!selectedCommune}
            placeholder={selectedCommune ? "Sélectionner ou saisir une nouvelle localité" : "Choisir d'abord une commune"}
          />
          <datalist id="lotissements-datalist">
            {selectedCommune?.lotissements.map((lotissement) => (
              <option key={lotissement.id} value={lotissement.nom} />
            ))}
          </datalist>
          <FieldError errors={[errors.lotissementNom]} />
        </FieldContent>
      </Field>
    </div>
  );
}
