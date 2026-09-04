import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const toneStyles = {
  default: {
    bar: "bg-primary",
    icon: "bg-primary/10 text-primary ring-primary/20",
    value: "text-foreground",
  },
  success: {
    bar: "bg-brand-green",
    icon: "bg-brand-green/10 text-brand-green ring-brand-green/20",
    value: "text-brand-green",
  },
  destructive: {
    bar: "bg-destructive",
    icon: "bg-destructive/10 text-destructive ring-destructive/20",
    value: "text-destructive",
  },
} as const;

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "destructive" | "success";
}) {
  const style = toneStyles[tone];

  return (
    <Card className="relative min-h-[118px] bg-card/95 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(16,24,40,0.10)]">
      <div className={cn("absolute inset-x-0 top-0 h-1", style.bar)} aria-hidden="true" />
      <CardContent className="flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-3">
          <div className={cn("text-3xl font-semibold leading-none tracking-tight tabular-nums", style.value)}>{value}</div>
          <div className="space-y-1">
            <div className="truncate text-sm font-medium text-foreground">{label}</div>
            {hint && <div className="text-xs font-medium text-muted-foreground">{hint}</div>}
          </div>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1", style.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}