import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatTone = "default" | "success" | "warning" | "destructive";

interface PageHeaderStat {
  label: string;
  value: ReactNode;
  tone?: StatTone;
}

const statToneClass: Record<StatTone, string> = {
  default: "text-primary",
  success: "text-brand-green",
  warning: "text-brand-gold",
  destructive: "text-destructive",
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  stats,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  stats?: PageHeaderStat[];
  className?: string;
}) {
  return (
    <section className={cn("relative min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card/95 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_18px_48px_rgba(16,24,40,0.07)] sm:p-5 lg:p-6", className)}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/8 to-transparent" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {Icon ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
            {eyebrow ? (
              <Badge variant="secondary" className="w-fit rounded-md border border-border/60 bg-background/80 uppercase tracking-[0.16em]">
                {eyebrow}
              </Badge>
            ) : null}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{title}</h1>
            {description ? <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={String(stat.label)} className="min-w-0 rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm">
              <div className="truncate text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{stat.label}</div>
              <div className={cn("mt-1 truncate text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", statToneClass[stat.tone ?? "default"])}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}