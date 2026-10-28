"use client";

import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
import { Archive, PackagePlus } from "lucide-react";
import { CartonCotePreview } from "@/components/collecte/CartonCotePreview";
import { CartonPicker } from "@/components/collecte/CartonPicker";
import { QrCameraScanner } from "@/components/cartons/QrCameraScanner";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { coteFromScan } from "@/lib/cartons/scan";
import { REFERENTIEL_CLASSEMENT } from "@/lib/referentiel/classement";
import type { DossierFormValues } from "@/lib/validation/dossier";
import { cn } from "@/lib/utils";
import { StepSite, type SiteOption } from "./StepSite";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Étape 1 de l'inventaire, sous forme de questions : le dossier rejoint-il un
 * carton déjà commencé (choisi par sa cote) ou ouvre-t-il un nouveau carton ?
 * Pour un nouveau carton : emplacement, rubrique du référentiel, commune et
 * libellé, qui fixent sa cote (2010-KOU-0001). Le dossier reçoit le n° suivant.
 */
export function StepCarton({
  form,
  sites,
  communes,
  draftId,
}: {
  form: UseFormReturn<DossierFormValues>;
  sites: SiteOption[];
  communes: { id: number; nom: string }[];
  draftId?: number;
}) {
  const { control, register, setValue, formState } = form;
  const errors = formState.errors;
  const [mode, cartonCote, classement, communeId, siteId, libelleCarton] = useWatch({
    control,
    name: ["modeCarton", "cartonCote", "classement", "communeId", "siteId", "libelleCarton"],
  });
  const cote = cartonCote ? coteFromScan(cartonCote) : null;

  // Carton déjà commencé : le dossier prend son emplacement et son libellé.
  useEffect(() => {
    if (mode !== "EXISTANT" || !cote) return;
    const abort = new AbortController();
    fetch(`/api/cartons/apercu-cote?cote=${encodeURIComponent(cote)}`, { signal: abort.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((carton: { mode: string; siteId?: number | null; entrepotId?: number | null; libelle?: string | null; communeId?: number | null } | null) => {
        if (carton?.mode !== "existant") return;
        setValue("siteId", carton.siteId ?? undefined);
        setValue("entrepotId", carton.entrepotId ?? undefined);
        setValue("libelleCarton", carton.libelle ?? "");
        if (!form.getValues("communeId") && carton.communeId) setValue("communeId", carton.communeId);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [mode, cote, setValue, form]);

  function choose(value: "EXISTANT" | "NOUVEAU") {
    setValue("modeCarton", value, { shouldValidate: false });
    form.clearErrors("modeCarton");
    if (value === "NOUVEAU") {
      setValue("cartonCote", "");
      if (!form.getValues("classement")) setValue("classement", "2010");
    }
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Ce dossier va dans…</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard active={mode === "EXISTANT"} onClick={() => choose("EXISTANT")} icon={<Archive className="size-5" />} title="Un carton déjà commencé" text="Je choisis le carton par sa cote : le dossier prend le numéro suivant." />
          <ChoiceCard active={mode === "NOUVEAU"} onClick={() => choose("NOUVEAU")} icon={<PackagePlus className="size-5" />} title="Un nouveau carton" text="J'ouvre un carton : il reçoit sa cote, ce dossier sera le n° 001." />
        </div>
        <FieldError errors={[errors.modeCarton]} />
      </fieldset>

      {mode === "EXISTANT" ? (
        <div className="space-y-3">
          <Field>
            <FieldLabel>Quel carton ?</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="cartonCote"
                render={({ field }) => <CartonPicker value={field.value ?? ""} onChange={field.onChange} />}
              />
              <QrCameraScanner onCode={(text) => setValue("cartonCote", coteFromScan(text) ?? text.trim(), { shouldDirty: true })} />
              <FieldError errors={[errors.cartonCote]} />
            </FieldContent>
          </Field>
          {cote ? <CartonCotePreview cote={cote} draftId={draftId} /> : null}
        </div>
      ) : null}

      {mode === "NOUVEAU" ? (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Où est rangé ce carton ?</p>
            <StepSite form={form} sites={sites} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="classement">Classement (référentiel MULCV)</FieldLabel>
              <FieldContent>
                <select id="classement" {...register("classement")} className={selectClass}>
                  {REFERENTIEL_CLASSEMENT.map((serie) => (
                    <optgroup key={serie.code} label={`${serie.code} · ${serie.libelle}`}>
                      {serie.rubriques.map((rubrique) => <option key={rubrique.code} value={rubrique.code}>{rubrique.code} · {rubrique.libelle}</option>)}
                    </optgroup>
                  ))}
                </select>
                <FieldDescription>Les dossiers fonciers sont des « 2010 · Dossiers ACD ».</FieldDescription>
                <FieldError errors={[errors.classement]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="carton-commune">Commune des dossiers du carton</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="communeId"
                  render={({ field }) => (
                    <select id="carton-commune" value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value ? Number(event.target.value) : undefined)} className={selectClass}>
                      <option value="">Choisir la commune</option>
                      {communes.map((commune) => <option key={commune.id} value={commune.id}>{commune.nom}</option>)}
                    </select>
                  )}
                />
                <FieldDescription>Elle donne les lettres de la cote (Koumassi → KOU).</FieldDescription>
                <FieldError errors={[errors.communeId]} />
              </FieldContent>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="libelle-carton">Libellé écrit sur le carton</FieldLabel>
              <FieldContent>
                <Input id="libelle-carton" {...register("libelleCarton")} placeholder="Ex. Koumassi remblai I" />
                <FieldError errors={[errors.libelleCarton]} />
              </FieldContent>
            </Field>
          </div>
          <CartonCotePreview nouveau classement={classement || "2010"} communeId={communeId} siteId={siteId} libelle={libelleCarton} draftId={draftId} />
        </div>
      ) : null}
    </div>
  );
}

function ChoiceCard({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

/** Contrôles de l'étape 1 avant de continuer : chaque champ manquant est signalé. */
export async function checkCartonStep(form: UseFormReturn<DossierFormValues>, sites: SiteOption[]): Promise<boolean> {
  const values = form.getValues();
  const fail = (field: keyof DossierFormValues, message: string) => { form.setError(field, { message }); return false; };
  if (!values.modeCarton) return fail("modeCarton", "Répondez : carton déjà commencé ou nouveau carton ?");
  if (values.modeCarton === "EXISTANT") {
    const cote = values.cartonCote ? coteFromScan(values.cartonCote) : null;
    if (!cote) return fail("cartonCote", "Choisissez le carton dans la liste, scannez son QR ou saisissez sa cote (ex. 2010-KOU-0001).");
    const response = await fetch(`/api/cartons/apercu-cote?cote=${encodeURIComponent(cote)}`).catch(() => null);
    const body = response?.ok ? await response.json() as { mode: string } : null;
    if (body?.mode !== "existant") return fail("cartonCote", `Aucun carton ne porte la cote ${cote}.`);
    form.setValue("cartonCote", cote);
    return true;
  }
  let ok = true;
  const site = sites.find((s) => s.id === values.siteId);
  if (sites.length && !site) ok = fail("siteId", "Choisissez le site où le carton est rangé.");
  if (site && site.entrepots.length && !values.entrepotId) ok = fail("entrepotId", "Choisissez la salle.");
  if (!values.classement) ok = fail("classement", "Choisissez la rubrique de classement.");
  if (!values.communeId) ok = fail("communeId", "Choisissez la commune : elle entre dans la cote du carton.");
  if (!values.libelleCarton?.trim()) ok = fail("libelleCarton", "Recopiez le libellé écrit sur le carton.");
  return ok;
}
