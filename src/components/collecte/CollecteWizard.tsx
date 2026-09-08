"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Box, CheckCircle2, CopyPlus, Loader2, PackagePlus, Save, Send, XCircle } from "lucide-react";

import { dossierFormSchema, dossierSubmitSchema, DOSSIER_STEPS, type DossierFormValues } from "@/lib/validation/dossier";
import { saveDraft, submitDossier } from "@/lib/services/dossier-service";
import {
  extractActiveCartonValues,
  getActiveCartonLabel,
  hasActiveCartonIdentity,
  type ActiveCartonValues,
} from "@/lib/utils/carton-prefill";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { StepIndicator } from "./StepIndicator";
import { StepSite, type SiteOption } from "./steps/StepSite";
import { StepIdentification } from "./steps/StepIdentification";
import { StepFoncier } from "./steps/StepFoncier";
import { StepDossier } from "./steps/StepDossier";
import type { TypePieceOption } from "./steps/TypesPiecesField";
import { StepTitulaire } from "./steps/StepTitulaire";
import { StepContact } from "./steps/StepContact";
import { StepSuivi } from "./steps/StepSuivi";
import { StepRecap } from "./steps/StepRecap";

interface CommuneWithLotissements {
  id: number;
  nom: string;
  lotissements: { id: number; nom: string }[];
}
interface NatureDossier {
  id: number;
  libelle: string;
}
interface Operateur {
  id: number;
  nom: string;
  prenoms: string | null;
  matricule: string;
}

export interface CollecteWizardProps {
  initialValues?: Partial<DossierFormValues>;
  initialDraftId?: number;
  sites: SiteOption[];
  communes: CommuneWithLotissements[];
  natures: NatureDossier[];
  typesPiece: TypePieceOption[];
  operateurs: Operateur[];
  isOperateurRole: boolean;
  currentUserId: number;
  currentUserName: string;
}

const EMPTY_VALUES: DossierFormValues = {};

export function CollecteWizard({
  initialValues,
  initialDraftId,
  sites,
  communes,
  natures,
  typesPiece,
  operateurs,
  isOperateurRole,
  currentUserId,
  currentUserName,
}: CollecteWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [draftId, setDraftId] = useState<number | undefined>(initialDraftId);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<{ reference: string; carton: ActiveCartonValues } | null>(null);
  const [isContinuingCarton, setIsContinuingCarton] = useState(false);

  const form = useForm<DossierFormValues>({
    resolver: zodResolver(dossierFormSchema),
    defaultValues: { ...EMPTY_VALUES, ...initialValues },
    mode: "onBlur",
  });

  const activeStep = DOSSIER_STEPS[currentStep - 1];
  const stepFields = activeStep.fields;
  const percent = Math.round((currentStep / DOSSIER_STEPS.length) * 100);
  const activeCartonStorageKey = "geoarchives:active-carton:" + currentUserId;
  const [cartonLabelValue, cartonBarcodeValue] = useWatch({
    control: form.control,
    name: ["libelleCarton", "codeBarres"],
  });
  const cartonLabel = cartonLabelValue?.trim();
  const cartonBarcode = cartonBarcodeValue?.trim();
  const canRestoreActiveCarton = !initialDraftId && !initialValues;

  useEffect(() => {
    if (!canRestoreActiveCarton) return;

    try {
      const stored = window.sessionStorage.getItem(activeCartonStorageKey);
      if (!stored) return;
      const carton = JSON.parse(stored) as ActiveCartonValues;
      if (!hasActiveCartonIdentity(carton)) {
        window.sessionStorage.removeItem(activeCartonStorageKey);
        return;
      }
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        form.reset({ ...EMPTY_VALUES, ...carton });
        setIsContinuingCarton(true);
        setCurrentStep(3);
      });
      return () => {
        cancelled = true;
      };
    } catch {
      window.sessionStorage.removeItem(activeCartonStorageKey);
    }
  }, [activeCartonStorageKey, canRestoreActiveCarton, form]);

  async function goNext() {
    if (stepFields.length > 0) {
      const fieldsToValidate = [...stepFields] as (keyof DossierFormValues)[];
      const valid = await form.trigger(fieldsToValidate);
      if (!valid) return;
    }
    setCurrentStep((s) => Math.min(s + 1, DOSSIER_STEPS.length));
  }

  function goPrev() {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }

  function persistActiveCarton(carton: ActiveCartonValues) {
    window.sessionStorage.setItem(activeCartonStorageKey, JSON.stringify(carton));
  }

  function clearActiveCarton() {
    window.sessionStorage.removeItem(activeCartonStorageKey);
  }

  function startNextDossier(mode: "same-carton" | "new-carton", carton: ActiveCartonValues) {
    setDraftId(undefined);
    setDone(null);

    if (mode === "same-carton") {
      persistActiveCarton(carton);
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        form.reset({ ...EMPTY_VALUES, ...carton });
        setIsContinuingCarton(true);
        setCurrentStep(3);
      });
      return () => {
        cancelled = true;
      };
      toast.success(getActiveCartonLabel(carton) + " reste actif. Les informations du nouveau dossier sont vides.");
      return;
    }

    clearActiveCarton();
    form.reset(EMPTY_VALUES);
    setIsContinuingCarton(false);
    setCurrentStep(1);
    toast.success("Nouveau carton prêt à être renseigné.");
  }

  function handleSaveDraft(mode: "stay" | "same-carton" | "new-carton") {
    const values = form.getValues();
    const carton = extractActiveCartonValues(values);

    if (mode === "same-carton" && !hasActiveCartonIdentity(carton)) {
      toast.error("Renseignez le libellé ou le code-barres du carton avant de le continuer.");
      setCurrentStep(2);
      return;
    }

    startTransition(async () => {
      try {
        const result = await saveDraft(values, draftId);
        if (mode === "stay") {
          setDraftId(result.id);
          toast.success("Brouillon enregistré - " + result.reference);
        } else {
          startNextDossier(mode, carton);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du brouillon.");
      }
    });
  }
  function handleSubmitFinal() {
    const values = form.getValues();
    const parsed = dossierSubmitSchema.safeParse(values);
    if (!parsed.success) {
      // Reporte les erreurs sur les champs concernés et ramène l'utilisateur
      // à la première étape en défaut.
      let firstErrorStep: number | null = null;
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof DossierFormValues;
        form.setError(field, { message: issue.message });
        const stepOfField = DOSSIER_STEPS.find((s) => (s.fields as readonly string[]).includes(field as string));
        if (stepOfField && (firstErrorStep === null || stepOfField.id < firstErrorStep)) {
          firstErrorStep = stepOfField.id;
        }
      }
      if (firstErrorStep) setCurrentStep(firstErrorStep);
      toast.error("Veuillez compléter les champs obligatoires avant de soumettre.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitDossier(values, draftId);
        setDone({ reference: result.reference, carton: extractActiveCartonValues(values) });
        toast.success(`Dossier ${result.reference} soumis avec succès.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la soumission du dossier.");
      }
    });
  }

  function handleStartNew(mode: "same-carton" | "new-carton") {
    if (!done) return;
    startNextDossier(mode, done.carton);
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-2xl border-primary/20 bg-card/95 shadow-[0_24px_80px_rgba(16,24,40,0.10)]">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center sm:p-12">
          <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">Dossier soumis avec succès</h3>
            <p className="text-sm text-muted-foreground">
              Référence : <span className="font-mono font-semibold text-foreground">{done.reference}</span>
            </p>
            <p className="text-sm text-muted-foreground">Le dossier est maintenant en contrôle avant validation.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Retour au tableau de bord
            </Button>
            {hasActiveCartonIdentity(done.carton) ? (
              <Button onClick={() => handleStartNew("same-carton")}>
                <CopyPlus className="mr-1 h-4 w-4" />
                Ajouter au même carton
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => handleStartNew("new-carton")}>
              <PackagePlus className="mr-1 h-4 w-4" />
              Nouveau carton
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border/70 bg-card/95 p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_16px_44px_rgba(16,24,40,0.06)] sm:flex-row sm:items-end sm:justify-between">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" aria-hidden="true" />
        <div className="space-y-3">
          <Badge variant="secondary" className="w-fit rounded-md border border-border/60 bg-muted/70 uppercase tracking-[0.16em]">
            Collecte CG1020
          </Badge>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Fiche d&apos;inventaire</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {draftId ? `Brouillon en cours — dossier #${draftId}` : "Nouveau dossier en cours de création"}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm shadow-sm">
          <span className="text-muted-foreground">Étape active</span>
          <div className="mt-1 text-right text-xl font-semibold tabular-nums text-primary">{percent}%</div>
        </div>
      </div>

      {isContinuingCarton ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-green/25 bg-brand-green/[0.055] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
              <Box className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-brand-green">Carton actif repris automatiquement</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {[cartonLabel || "Carton sans libellé", cartonBarcode].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <Button type="button" size="sm" variant="outline" className="w-full bg-background/70 sm:w-auto" onClick={() => setCurrentStep(2)}>
            Vérifier le carton
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm xl:sticky xl:top-20 xl:self-start">
          <StepIndicator currentStep={currentStep} onStepChange={setCurrentStep} />
        </aside>

        <Card className="min-w-0">
          <CardHeader className="border-b bg-muted/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl tracking-tight">{activeStep.title}</CardTitle>
                <CardDescription>
                  Étape {currentStep} sur {DOSSIER_STEPS.length} — les champs seront vérifiés avant de continuer.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70 font-semibold tabular-nums">
                {currentStep}/{DOSSIER_STEPS.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-5">
            <form onSubmit={(e) => e.preventDefault()}>
              {currentStep === 1 && <StepSite form={form} sites={sites} />}
              {currentStep === 2 && (
                <StepIdentification
                  form={form}
                  operateurs={operateurs}
                  isOperateurRole={isOperateurRole}
                  currentUserName={currentUserName}
                  isCartonCarryOver={isContinuingCarton}
                />
              )}
              {currentStep === 3 && <StepFoncier form={form} communes={communes} />}
              {currentStep === 4 && <StepDossier form={form} natures={natures} typesPiece={typesPiece} />}
              {currentStep === 5 && <StepTitulaire form={form} />}
              {currentStep === 6 && <StepContact form={form} />}
              {currentStep === 7 && <StepSuivi form={form} />}
              {currentStep === 8 && (
                <StepRecap
                  form={form}
                  onEditStep={setCurrentStep}
                  lookups={{ sites, communes, natures, typesPiece, operateurs, isOperateurRole, currentUserName }}
                />
              )}
            </form>

            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 lg:flex-row lg:items-center lg:justify-between">
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button type="button" variant="ghost" disabled={isPending}>
                      <XCircle className="mr-1 h-4 w-4" />
                      Annuler
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Annuler la saisie ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Les modifications non enregistrées seront perdues. Le brouillon déjà enregistré, le cas échéant,
                      restera disponible pour être repris plus tard.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continuer la saisie</AlertDialogCancel>
                    <AlertDialogAction onClick={() => router.push("/dashboard")}>Quitter</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft("stay")}>
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Enregistrer brouillon
                </Button>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft("same-carton")}>
                  <CopyPlus className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Enregistrer + </span>même carton
                </Button>
                <Button type="button" variant="ghost" disabled={isPending} onClick={() => handleSaveDraft("new-carton")}>
                  <PackagePlus className="mr-1 h-4 w-4" />
                  <span className="hidden sm:inline">Enregistrer + </span>nouveau carton
                </Button>
                {currentStep > 1 && (
                  <Button type="button" variant="outline" disabled={isPending} onClick={goPrev}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </Button>
                )}
                {currentStep < DOSSIER_STEPS.length ? (
                  <Button type="button" disabled={isPending} onClick={goNext}>
                    Suivant
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" disabled={isPending} onClick={handleSubmitFinal}>
                    {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                    Soumettre
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
