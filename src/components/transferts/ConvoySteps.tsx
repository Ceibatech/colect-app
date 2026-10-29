import { minutesBetween, type ConvoyState } from "@/lib/transfers/convoy";
import { formatDuree } from "@/lib/activite/categories";
import { cn } from "@/lib/utils";

const time = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Abidjan" });

type Step = { label: string; at: Date | null; detail?: string | null; current?: boolean };

/**
 * Déroulé du convoi, du chargement au déchargement, avec la durée de chaque
 * phase : chargement, trajet, déchargement. Une étape à venir reste grisée.
 */
export function ConvoySteps({ state, className }: { state: Pick<ConvoyState, "loadingStartedAt" | "loadingEndedAt" | "departedAt" | "movingAt" | "movingAutomatic" | "etaAt" | "arrivedAt" | "arrivalAutomatic" | "unloadingStartedAt" | "unloadingEndedAt" | "onTheRoad" | "arrived">; className?: string }) {
  const loading = minutesBetween(state.loadingStartedAt, state.loadingEndedAt);
  const trip = minutesBetween(state.movingAt ?? state.departedAt, state.arrivedAt);
  const unloading = minutesBetween(state.unloadingStartedAt, state.unloadingEndedAt);
  const departedInCycle = state.onTheRoad || state.arrived ? state.departedAt : null;
  const steps: Step[] = [
    { label: "Début du chargement", at: state.loadingStartedAt },
    { label: "Fin du chargement", at: state.loadingEndedAt, detail: loading != null ? `chargement : ${formatDuree(loading)}` : null },
    { label: "Fiche de départ", at: departedInCycle },
    {
      label: "Véhicule en route",
      at: state.movingAt,
      detail: state.movingAt
        ? [state.movingAutomatic ? "détecté par GPS" : "signalé par le convoyeur", state.etaAt && !state.arrived ? `arrivée estimée vers ${time.format(state.etaAt)}` : null].filter(Boolean).join(", ")
        : state.onTheRoad ? "en attente du mouvement du véhicule" : null,
      current: state.onTheRoad && !state.movingAt,
    },
    { label: "Arrivée", at: state.arrivedAt, detail: state.arrivedAt ? [state.arrivalAutomatic ? "détectée par GPS" : null, trip != null ? `trajet : ${formatDuree(trip)}` : null].filter(Boolean).join(", ") : null },
    { label: "Début du déchargement", at: state.unloadingStartedAt },
    { label: "Fin du déchargement", at: state.unloadingEndedAt, detail: unloading != null ? `déchargement : ${formatDuree(unloading)}` : null },
  ];
  return (
    <ol className={cn("grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2", className)} aria-label="Étapes du convoi">
      {steps.map((step) => (
        <li key={step.label} className={cn("flex items-baseline gap-2", !step.at && !step.current && "text-muted-foreground/70")}>
          <span className={cn("mt-1 size-2 shrink-0 self-start rounded-full", step.at ? "bg-brand-green" : step.current ? "bg-brand-gold" : "bg-muted-foreground/30")} aria-hidden />
          <span>
            <span className={step.at ? "font-medium" : undefined}>{step.label}</span>
            {step.at ? <span className="tabular-nums"> · {time.format(step.at)}</span> : null}
            {step.detail ? <span className="block text-xs text-muted-foreground">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
