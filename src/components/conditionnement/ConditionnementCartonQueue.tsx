import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConditionnementCartonItem } from "@/lib/services/production-queue-service";

/** File des cartons numérisés : on ouvre un carton pour reconditionner ses dossiers un par un. */
export function ConditionnementCartonQueue({ cartons, canUpdate }: { cartons: ConditionnementCartonItem[]; canUpdate: boolean }) {
  if (cartons.length === 0) return <div className="border-t px-6 py-14 text-center text-sm text-muted-foreground">Aucun carton dans cette file.</div>;
  return (
    <div className="overflow-x-auto border-t">
      <Table className="min-w-[900px]">
        <TableHeader><TableRow className="bg-muted/55 hover:bg-muted/55"><TableHead className="pl-5">Carton</TableHead><TableHead>Site</TableHead><TableHead>Dossiers</TableHead><TableHead>Avancement</TableHead><TableHead>Agents</TableHead><TableHead className="text-right">Dossiers du carton</TableHead></TableRow></TableHeader>
        <TableBody>{cartons.map((carton) => {
          const remaining = carton.totalDossiers - carton.termines;
          return <TableRow key={carton.token}>
            <TableCell className="pl-5"><p className="font-mono text-sm font-semibold text-primary">{carton.label}</p>{carton.description ? <p className="text-xs text-muted-foreground">{carton.description}</p> : null}</TableCell>
            <TableCell>{carton.site}</TableCell>
            <TableCell className="font-semibold tabular-nums">{carton.totalDossiers}</TableCell>
            <TableCell><div className="flex flex-wrap gap-1">{carton.aConditionner > 0 ? <Badge variant="outline">{carton.aConditionner} à faire</Badge> : null}{carton.enCours > 0 ? <Badge variant="secondary">{carton.enCours} en cours</Badge> : null}{carton.termines > 0 ? <Badge>{carton.termines} terminé(s)</Badge> : null}</div></TableCell>
            <TableCell>{carton.agents.join(", ") || "—"}</TableCell>
            <TableCell className="text-right"><Link href={`/conditionnement?statut=TOUS&carton=${encodeURIComponent(carton.token)}`} className={buttonVariants({ size: "sm", variant: canUpdate && remaining > 0 ? "default" : "outline" })}>{canUpdate && remaining > 0 ? "Ouvrir le carton" : "Voir les dossiers"}</Link></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </div>
  );
}
