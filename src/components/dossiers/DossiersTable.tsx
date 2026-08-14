import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
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
      <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">
        Aucun dossier ne correspond à ces critères.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Référence</TableHead>
            <TableHead>Code-barres</TableHead>
            <TableHead>N° DDU</TableHead>
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
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs whitespace-nowrap">{d.reference}</TableCell>
              <TableCell className="whitespace-nowrap">{d.codeBarres ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.numeroDdu ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.nom ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.prenoms ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.commune?.nom ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{d.natureDossier?.libelle ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">
                {d.operateur ? `${d.operateur.nom} ${d.operateur.prenoms ?? ""}` : "—"}
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutCollecte)}>{STATUT_COLLECTE_LABELS[d.statutCollecte]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutValidation)}>{STATUT_VALIDATION_LABELS[d.statutValidation]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutNumerisation)}>
                  {STATUT_NUMERISATION_LABELS[d.statutNumerisation]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutIndexation)}>{STATUT_INDEXATION_LABELS[d.statutIndexation]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={statutBadgeVariant(d.statutArchivage)}>{STATUT_ARCHIVAGE_LABELS[d.statutArchivage]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Link
                    href={`/dossiers/${d.id}`}
                    aria-label="Voir"
                    className={buttonVariants({ size: "icon-sm", variant: "ghost" })}
                  >
                    <Eye className="h-4 w-4" />
                  </Link>
                  {d.statutCollecte === "BROUILLON" && (
                    <Link
                      href={`/collecte?draft=${d.id}`}
                      aria-label="Modifier"
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
