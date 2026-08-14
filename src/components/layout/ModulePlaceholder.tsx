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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Construction className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Badge variant="outline">Module à construire — {phase}</Badge>
      </CardContent>
    </Card>
  );
}
