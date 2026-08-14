import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "destructive" | "success";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            tone === "destructive" && "bg-destructive/10",
            tone === "success" && "bg-primary/10",
            (!tone || tone === "default") && "bg-muted"
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5",
              tone === "destructive" && "text-destructive",
              tone === "success" && "text-primary",
              (!tone || tone === "default") && "text-muted-foreground"
            )}
          />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
