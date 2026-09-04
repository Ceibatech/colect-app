import { Construction } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Empty state générique pour les modules pas encore construits, afin que la
 * navigation (Phase 4) soit entièrement cliquable et testable avant que
 * chaque module ne soit implémenté dans sa phase dédiée.
 */
export function ModulePlaceholder({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <Card className="mx-auto max-w-2xl border-dashed bg-card/95">
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Construction className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl tracking-tight">{title}</CardTitle>
            <CardDescription className="leading-6">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Badge variant="outline" className="rounded-md bg-background/70">
          Module à construire — {phase}
        </Badge>
      </CardContent>
    </Card>
  );
}