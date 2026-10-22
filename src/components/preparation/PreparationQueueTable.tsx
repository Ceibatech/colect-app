import Link from "next/link";
import { ClipboardCheck, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PermissionCode } from "@/lib/permissions/constants";
import type { PreparationWorkspaceItem } from "@/lib/services/preparation-service";
import { cn } from "@/lib/utils";
import { STATUT_PREPARATION_LABELS, statutBadgeVariant } from "@/lib/utils/dossier-status";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function PreparationQueueTable({
  items,
  permissions,
}: {
  items: PreparationWorkspaceItem[];
  permissions: PermissionCode[];
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center border-t border-dashed px-6 py-14 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ClipboardCheck className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Aucun dossier dans cette file</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Modifiez le statut ou la recherche pour afficher d’autres dossiers validés.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border-t">
      <Table className="min-w-[1040px]">
        <TableHeader>
          <TableRow className="bg-muted/55 hover:bg-muted/55">
            <TableHead>Dossier</TableHead>
            <TableHead>Site</TableHead>
            <TableHead>Inventorié par</TableHead>
            <TableHead>Préparé par</TableHead>
            <TableHead>Soumission</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const canPrepare =
              permissions.includes("PREPARATION_UPDATE") &&
              (item.statutPreparation === "EN_ATTENTE" || item.statutPreparation === "REJETE");
            const canValidate = permissions.includes("PREPARATION_VALIDATE") && item.statutPreparation === "A_VALIDER";
            const actionLabel = canPrepare ? "Préparer" : canValidate ? "Contrôler" : "Consulter";

            return (
              <TableRow key={item.id} className="hover:bg-accent/30">
                <TableCell>
                  <p className="font-mono text-xs font-semibold text-primary">{item.reference}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[item.nom, item.prenoms].filter(Boolean).join(" ") || item.libelleCarton || "Titulaire non renseigné"}
                  </p>
                </TableCell>
                <TableCell>{item.site?.nom ?? "À confirmer"}</TableCell>
                <TableCell>
                  <p className="font-medium">{`${item.operateur.nom} ${item.operateur.prenoms ?? ""}`.trim()}</p>
                  <p className="text-xs text-muted-foreground">{item.operateur.matricule}</p>
                </TableCell>
                <TableCell>{item.preparateur?.name ?? "Non attribué"}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {item.dateSoumissionPreparation ? dateFmt.format(item.dateSoumissionPreparation) : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={statutBadgeVariant(item.statutPreparation)} className="rounded-md">
                    {STATUT_PREPARATION_LABELS[item.statutPreparation]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/dossiers/${item.id}?tab=preparation&from=preparation`}
                    className={cn(buttonVariants({ size: "sm", variant: canPrepare || canValidate ? "default" : "outline" }), "whitespace-nowrap")}
                  >
                    {canPrepare || canValidate ? <ClipboardCheck className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
                    {actionLabel}
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
