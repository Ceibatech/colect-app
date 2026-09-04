import Link from "next/link";
import { Eye, FileSearch, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { DossierListItem } from "@/lib/services/dossier-query-service";
import {
  STATUT_COLLECTE_LABELS,
  STATUT_VALIDATION_LABELS,
  STATUT_NUMERISATION_LABELS,
  STATUT_INDEXATION_LABELS,
  STATUT_ARCHIVAGE_LABELS,
  statutBadgeVariant,
} from "@/lib/utils/dossier-status";

export function DossiersTable({ items }: { items: DossierListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/80 px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileSearch className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Aucun dossier trouvé</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
          Aucun dossier ne correspond à ces critères. Ajustez la recherche ou réinitialisez les filtres.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-sm">
      <Table className="min-w-[1280px]">
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Référence</TableHead>
            <TableHead>Code-barres</TableHead>
            <TableHead>Direction/Service</TableHead>
            <TableHead>Nom</TableHead>
            <TableHead>Prénoms</TableHead>
            <TableHead>Commune</TableHead>
            <TableHead>Nature</TableHead>
            <TableHead>Opérateur</TableHead>
            <TableHead>Collecte</TableHead>
            <TableHead>Validation</TableHead>
            <TableHead>Numérisation</TableHead>
            <TableHead>Indexation</TableHead>
            <TableHead>Archivage</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((d) => (
            <TableRow key={d.id} className="hover:bg-accent/30">
              <TableCell className="font-mono text-xs font-semibold text-primary whitespace-nowrap">{d.reference}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">{d.codeBarres ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.numeroDdu ?? "—"}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">{d.nom ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.prenoms ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.commune?.nom ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.natureDossier?.libelle ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">
                {d.operateur ? `${d.operateur.nom} ${d.operateur.prenoms ?? ""}` : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutCollecte)} className="rounded-md">
                  {STATUT_COLLECTE_LABELS[d.statutCollecte]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutValidation)} className="rounded-md">
                  {STATUT_VALIDATION_LABELS[d.statutValidation]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutNumerisation)} className="rounded-md">
                  {STATUT_NUMERISATION_LABELS[d.statutNumerisation]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutIndexation)} className="rounded-md">
                  {STATUT_INDEXATION_LABELS[d.statutIndexation]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutArchivage)} className="rounded-md">
                  {STATUT_ARCHIVAGE_LABELS[d.statutArchivage]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/dossiers/${d.id}`}
                    aria-label="Voir le dossier"
                    title="Voir le dossier"
                    className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  {d.statutCollecte === "BROUILLON" && (
                    <Link
                      href={`/collecte?draft=${d.id}`}
                      aria-label="Modifier le brouillon"
                      title="Modifier le brouillon"
                      className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}