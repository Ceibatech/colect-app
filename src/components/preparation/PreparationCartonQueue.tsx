import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PreparationCartonItem } from "@/lib/services/preparation-service";

export function PreparationCartonQueue({ cartons }: { cartons: PreparationCartonItem[] }) {
  if (cartons.length === 0) {
    return <div className="border-t px-6 py-14 text-center text-sm text-muted-foreground">Aucun carton dans cette file.</div>;
  }
  return (
    <div className="overflow-x-auto border-t">
      <Table className="min-w-[900px]">
        <TableHeader><TableRow className="bg-muted/55 hover:bg-muted/55"><TableHead>Carton</TableHead><TableHead>Site</TableHead><TableHead className="text-center">Dossiers</TableHead><TableHead>Avancement</TableHead><TableHead>Préparé par</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
        <TableBody>{cartons.map((carton) => (
          <TableRow key={carton.token}>
            <TableCell><p className="font-mono text-sm font-semibold text-primary">{carton.label}</p>{carton.description ? <p className="text-xs text-muted-foreground">{carton.description}</p> : null}</TableCell>
            <TableCell>{carton.site}</TableCell>
            <TableCell className="text-center text-lg font-semibold tabular-nums">{carton.totalDossiers}</TableCell>
            <TableCell><div className="flex flex-wrap gap-1.5">{carton.aPreparer > 0 ? <Badge variant="outline">{carton.aPreparer} disponible(s)</Badge> : null}{carton.enCours > 0 ? <Badge variant="secondary">{carton.enCours} en cours</Badge> : null}{carton.aControler > 0 ? <Badge variant="outline">{carton.aControler} à contrôler</Badge> : null}{carton.termines > 0 ? <Badge>{carton.termines} terminé(s)</Badge> : null}</div></TableCell>
            <TableCell>{carton.agents.join(", ") || "Non attribué"}</TableCell>
            <TableCell className="text-right"><Link href={`/preparation?statut=TOUS&carton=${encodeURIComponent(carton.token)}`} className={buttonVariants({ size: "sm" })}>Ouvrir le carton</Link></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    </div>
  );
}
