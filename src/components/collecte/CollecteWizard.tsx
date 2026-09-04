"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, FilePlus2, Loader2, Save, Send, XCircle } from "lucide-react";

import { dossierFormSchema, dossierSubmitSchema, DOSSIER_STEPS, type DossierFormValues } from "@/lib/validation/dossier";
import { saveDraft, submitDossier } from "@/lib/services/dossier-service";

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
  currentUserName,
}: CollecteWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [draftId, setDraftId] = useState<number | undefined>(initialDraftId);
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<{ reference: string } | null>(null);

  const form = useForm<DossierFormValues>({
    resolver: zodResolver(dossierFormSchema),
    defaultValues: { ...EMPTY_VALUES, ...initialValues },
    mode: "onBlur",
  });

  const activeStep = DOSSIER_STEPS[currentStep - 1];
  const stepFields = activeStep.fields;
  const percent = Math.round((currentStep / DOSSIER_STEPS.length) * 100);

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

  function handleSaveDraft(andNew: boolean) {
    startTransition(async () => {
      try {
        const values = form.getValues();
        const result = await saveDraft(values, draftId);
        setDraftId(result.id);
        toast.success(`Brouillon enregistré — ${result.reference}`);
        if (andNew) {
          form.reset(EMPTY_VALUES);
          setDraftId(undefined);
          setCurrentStep(1);
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
        setDone({ reference: result.reference });
        toast.success(`Dossier ${result.reference} soumis avec succès.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la soumission du dossier.");
      }
    });
  }

  function handleStartNew() {
    form.reset(EMPTY_VALUES);
    setDraftId(undefined);
    setDone(null);
    setCurrentStep(1);
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
            <Button onClick={handleStartNew}>
              <FilePlus2 className="mr-1 h-4 w-4" />
              Nouveau dossier
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border border-border/70 bg-card/95 p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
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

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm xl:sticky xl:top-20 xl:self-start">
          <StepIndicator currentStep={currentStep} />
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
                <StepIdentification form={form} operateurs={operateurs} isOperateurRole={isOperateurRole} currentUserName={currentUserName} />
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
                <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft(false)}>
                  {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Enregistrer brouillon
                </Button>
                <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft(true)}>
                  <FilePlus2 className="mr-1 h-4 w-4" />
                  Enregistrer et nouveau
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