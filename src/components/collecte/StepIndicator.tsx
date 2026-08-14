"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOSSIER_STEPS } from "@/lib/validation/dossier";
import { Progress } from "@/components/ui/progress";

export function StepIndicator({ currentStep }: { currentStep: number }) {
  const percent = (currentStep / DOSSIER_STEPS.length) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Étape {currentStep} / {DOSSIER_STEPS.length} — {DOSSIER_STEPS[currentStep - 1].title}
        </span>
        <span>{Math.round(percent)}%</span>
      </div>
      <Progress value={percent} />
      <ol className="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground md:flex">
        {DOSSIER_STEPS.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-1",
              step.id === currentStep && "font-medium text-foreground",
              step.id < currentStep && "text-foreground"
            )}
          >
            {step.id < currentStep ? (
              <Check className="h-3 w-3 text-primary" />
            ) : (
              <span className="tabular-nums">{step.id}.</span>
            )}
            {step.title}
          </li>
        ))}
      </ol>
    </div>
  );
}
