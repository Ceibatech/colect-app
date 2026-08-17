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
  const communeId = watch("communeId");
  const selectedCommune = communes.find((c) => c.id === communeId);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
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
        <FieldLabel>N° titre foncier</FieldLabel>
        <FieldContent>
          <Input {...register("numeroTitreFoncier")} />
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
          {/* Saisie libre (Phase 15+) : le référentiel lotissements n'est pas
              systématiquement pré-rempli pour chaque commune — un Select qui
              dépend d'une liste potentiellement vide bloquait la saisie. La
              résolution vers la fiche `lotissements` (existante ou créée à la
              volée) se fait côté serveur, cf. dossier-service.ts. La
              `datalist` suggère les lotissements déjà connus pour la commune
              choisie, sans empêcher de taper autre chose. */}
          <Input
            {...register("lotissementNom")}
            list="lotissements-datalist"
            disabled={!selectedCommune}
            placeholder={selectedCommune ? "Nom du lotissement" : "Choisir d'abord une commune"}
          />
          <datalist id="lotissements-datalist">
            {selectedCommune?.lotissements.map((l) => <option key={l.id} value={l.nom} />)}
          </datalist>
          <FieldError errors={[errors.lotissementNom]} />
        </FieldContent>
      </Field>
    </div>
  );
}
