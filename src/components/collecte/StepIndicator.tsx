"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOSSIER_STEPS } from "@/lib/validation/dossier";
import { Progress } from "@/components/ui/progress";

export function StepIndicator({
  currentStep,
  onStepChange,
}: {
  currentStep: number;
  onStepChange?: (step: number) => void;
}) {
  const percent = (currentStep / DOSSIER_STEPS.length) * 100;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-foreground">Progression</span>
          <span className="font-semibold tabular-nums text-primary">{Math.round(percent)}%</span>
        </div>
        <Progress value={percent} />
      </div>

      <ol className="flex gap-2 overflow-x-auto pb-1 text-sm xl:grid xl:gap-1.5 xl:overflow-visible xl:pb-0">
        {DOSSIER_STEPS.map((step) => {
          const complete = step.id < currentStep;
          const active = step.id === currentStep;
          const reachable = step.id <= currentStep && Boolean(onStepChange);

          return (
            <li key={step.id} className="shrink-0 xl:w-full">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onStepChange?.(step.id)}
                className={cn(
                  "flex min-w-36 items-center gap-2 rounded-lg px-2 py-2 text-left text-muted-foreground transition-colors xl:w-full",
                  active && "bg-primary/10 font-medium text-foreground",
                  complete && "text-foreground hover:bg-muted/70",
                  !reachable && "cursor-default"
                )}
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    complete && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-background text-primary",
                    !complete && !active && "border-border bg-muted text-muted-foreground"
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>
                <span className="min-w-0 truncate">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
