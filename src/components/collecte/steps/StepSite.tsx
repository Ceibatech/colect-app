"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export interface SiteOption {
  id: number;
  code: string;
  nom: string;
  typeSite: string | null;
  adresse: string | null;
  quartier: string | null;
  ville: string | null;
  region: string | null;
  responsable: string | null;
  telephone: string | null;
  commune: { id: number; nom: string } | null;
}

/**
 * Étape 1 (Phase 16+) : sélection du site d'archivage physique auquel le
 * dossier est rattaché — référentiel géré depuis
 * /administration/sites. Optionnel tant qu'aucun site n'a été créé (cf.
 * dossierFormSchema), pour ne jamais bloquer la Collecte le temps qu'un
 * administrateur peuple le référentiel.
 */
export function StepSite({ form, sites }: { form: UseFormReturn<DossierFormValues>; sites: SiteOption[] }) {
  const { control, formState } = form;
  const errors = formState.errors;

  return (
    <div className="space-y-4">
      {sites.length === 0 ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Aucun site n&apos;est encore configuré. Vous pouvez continuer la collecte sans sélectionner de site —
            demandez à un administrateur d&apos;en créer un dans Administration → Sites.
          </AlertDescription>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel>Site d&apos;archivage</FieldLabel>
        <FieldContent>
          <Controller
            control={control}
            name="siteId"
            render={({ field }) => (
              <Select
                items={sites.map((s) => ({ label: `${s.nom} (${s.code})`, value: s.id }))}
                value={field.value ?? null}
                onValueChange={field.onChange}
                disabled={sites.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sélectionner un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nom} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError errors={[errors.siteId]} />
        </FieldContent>
      </Field>

      <SiteSummary form={form} sites={sites} />
    </div>
  );
}

function SiteSummary({ form, sites }: { form: UseFormReturn<DossierFormValues>; sites: SiteOption[] }) {
  const siteId = form.watch("siteId");
  const site = sites.find((s) => s.id === siteId);
  if (!site) return null;

  const localisation = [site.quartier, site.commune?.nom, site.ville, site.region].filter(Boolean).join(", ");

  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
      {site.typeSite ? (
        <>
          <dt className="text-muted-foreground">Type</dt>
          <dd>{site.typeSite}</dd>
        </>
      ) : null}
      {site.adresse ? (
        <>
          <dt className="text-muted-foreground">Adresse</dt>
          <dd>{site.adresse}</dd>
        </>
      ) : null}
      {localisation ? (
        <>
          <dt className="text-muted-foreground">Localisation</dt>
          <dd>{localisation}</dd>
        </>
      ) : null}
      {site.responsable ? (
        <>
          <dt className="text-muted-foreground">Responsable</dt>
          <dd>{site.responsable}</dd>
        </>
      ) : null}
      {site.telephone ? (
        <>
          <dt className="text-muted-foreground">Téléphone</dt>
          <dd>{site.telephone}</dd>
        </>
      ) : null}
    </dl>
  );
}
