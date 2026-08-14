"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

import { dossierFormSchema, dossierSubmitSchema, DOSSIER_STEPS, type DossierFormValues } from "@/lib/validation/dossier";
import { saveDraft, submitDossier } from "@/lib/services/dossier-service";

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
import { StepIdentification } from "./steps/StepIdentification";
import { StepFoncier } from "./steps/StepFoncier";
import { StepDossier } from "./steps/StepDossier";
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
  communes: CommuneWithLotissements[];
  natures: NatureDossier[];
  operateurs: Operateur[];
  isOperateurRole: boolean;
  currentUserName: string;
}

const EMPTY_VALUES: DossierFormValues = {};

export function CollecteWizard({
  initialValues,
  initialDraftId,
  communes,
  natures,
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

  const stepFields = DOSSIER_STEPS[currentStep - 1].fields;

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
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Dossier soumis avec succès</h3>
            <p className="text-sm text-muted-foreground">
              Référence : <span className="font-mono font-medium text-foreground">{done.reference}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Le dossier est maintenant en contrôle avant validation.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Retour au tableau de bord
            </Button>
            <Button onClick={handleStartNew}>Nouveau dossier</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Collecte — Fiche d&apos;inventaire CG1020</CardTitle>
        <CardDescription>
          {draftId ? `Brouillon en cours (dossier #${draftId})` : "Nouveau dossier"}
        </CardDescription>
        <StepIndicator currentStep={currentStep} />
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={(e) => e.preventDefault()}>
          {currentStep === 1 && (
            <StepIdentification form={form} operateurs={operateurs} isOperateurRole={isOperateurRole} currentUserName={currentUserName} />
          )}
          {currentStep === 2 && <StepFoncier form={form} communes={communes} />}
          {currentStep === 3 && <StepDossier form={form} natures={natures} />}
          {currentStep === 4 && <StepTitulaire form={form} />}
          {currentStep === 5 && <StepContact form={form} />}
          {currentStep === 6 && <StepSuivi form={form} />}
          {currentStep === 7 && (
            <StepRecap
              form={form}
              onEditStep={setCurrentStep}
              lookups={{ communes, natures, operateurs, isOperateurRole, currentUserName }}
            />
          )}
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="ghost" disabled={isPending}>
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

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft(false)}>
              {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Enregistrer brouillon
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={() => handleSaveDraft(true)}>
              Enregistrer et nouveau
            </Button>
            {currentStep > 1 && (
              <Button type="button" variant="outline" disabled={isPending} onClick={goPrev}>
                Précédent
              </Button>
            )}
            {currentStep < DOSSIER_STEPS.length ? (
              <Button type="button" disabled={isPending} onClick={goNext}>
                Suivant
              </Button>
            ) : (
              <Button type="button" disabled={isPending} onClick={handleSubmitFinal}>
                {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Soumettre
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
