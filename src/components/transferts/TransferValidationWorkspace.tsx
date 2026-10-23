import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataPagination } from "@/components/shared/DataPagination";
import { ApproveTransferLotByCeibacButton, AuthorizeTransferButton, ReceptionApprovalDialog } from "@/components/transferts/TransferActions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { getTransferValidationWorkspace } from "@/lib/services/transfer-validation-service";
import type { TransferValidationSearch } from "@/lib/validation/transfer-validation-search";
import { getTransferMovementLabel, getTransferMovementStatusLabel } from "@/lib/utils/transfer-stock";

type WorkspaceData = Awaited<ReturnType<typeof getTransferValidationWorkspace>>;
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const FILTERS = [
  { value: "A_VALIDER", label: "À signer par le SDA" },
  { value: "ATTENTE_CEIBAC", label: "En attente de validation interne" },
  { value: "VALIDES", label: "Validés" },
  { value: "TOUS", label: "Tous les bordereaux" },
] as const;

export function TransferValidationWorkspace({ data, filters, stage }: {
  data: WorkspaceData;
  filters: TransferValidationSearch;
  stage: "CEIBA" | "MINISTERE";
}) {
  const ministry = stage === "MINISTERE";
  const basePath = ministry ? "/transferts/validation" : "/transferts/validation-ceibac";
  const pendingReceptions = ministry ? data.summary.pendingReceptions : data.summary.awaitingCeibac;
  const paginationParams = { statut: filters.statut, ...(filters.q ? { q: filters.q } : {}) };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Transferts d’archives"
        icon={ShieldCheck}
        title={ministry ? "Validation SDA" : "Validation interne"}
        description={ministry
          ? "Examinez les opérations validées en interne, autorisez leur sortie et consultez les bordereaux de réception à contre-signer."
          : "Contrôlez les opérations soumises par le gestionnaire avant leur transmission au SDA, puis les constats d’arrivée."}
        actions={<Link href="/transferts" className={buttonVariants({ variant: "outline" })}><ArrowLeft /> Registre et suivi</Link>}
        stats={[
          { label: ministry ? "Lots à autoriser" : "Lots à valider", value: data.summary.pendingLots },
          { label: "Réceptions à signer", value: pendingReceptions },
        ]}
        tone="transfer"
      />

      <Card>
        <CardHeader>
          <CardTitle>{ministry ? "Autorisation de sortie des lots" : "Validation des lots avant départ"}</CardTitle>
          <CardDescription>{ministry
            ? "Ces opérations ont reçu la validation interne. La sortie reste bloquée jusqu’à l’autorisation du SDA."
            : "Ces opérations attendent la validation interne. Votre signature les transmet au SDA."}</CardDescription>
        </CardHeader>
        {data.lots.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">Aucun lot en attente à cette étape.</p></CardContent> : (
          <div className="divide-y border-t">
            {data.lots.map((lot) => (
              <article key={lot.id} className="flex flex-col justify-between gap-4 p-5 xl:flex-row xl:items-center">
                <div>
                  <h2 className="font-mono font-semibold">{lot.reference}</h2>
                  <p className="mt-1 text-sm">{lot.source} → {lot.destination}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{lot.dossierCount} dossiers · créé le {dateFormatter.format(lot.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/transferts/${lot.id}`} className={buttonVariants({ variant: "outline" })}>Examiner le lot</Link>
                  <Link href={`/transferts/${lot.id}/autorisation`} className={buttonVariants({ variant: "outline" })}><FileText /> Fiche du lot</Link>
                  {ministry ? <AuthorizeTransferButton lotId={lot.id} /> : <ApproveTransferLotByCeibacButton lotId={lot.id} />}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{ministry ? "Bordereaux et constats de réception" : "Constats d’arrivée à viser"}</CardTitle>
          <CardDescription>La fiche du lot est consultable avant le départ. Les bordereaux de mouvement sont créés lors de la sortie, de la réception ou du retour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ministry ? (
            <nav className="flex flex-wrap gap-2" aria-label="Filtrer les bordereaux">
              {FILTERS.map((filter) => (
                <Link key={filter.value}
                  href={`${basePath}?${new URLSearchParams({ statut: filter.value, ...(filters.q ? { q: filters.q } : {}) })}`}
                  aria-current={filter.value === filters.statut ? "page" : undefined}
                  className={buttonVariants({ size: "sm", variant: filter.value === filters.statut ? "default" : "outline" })}>
                  {filter.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <form action={basePath} method="get" className="flex max-w-xl flex-wrap gap-2">
            <input type="hidden" name="statut" value={filters.statut} />
            <Input key={`${filters.statut}:${filters.q ?? ""}`} name="q" defaultValue={filters.q} maxLength={200}
              aria-label="Référence du bordereau ou du lot" placeholder="Référence du bordereau ou du lot" className="min-w-48 flex-1" />
            <Button type="submit" variant="outline">Rechercher</Button>
            {filters.q ? <Link href={`${basePath}?statut=${filters.statut}`} className={buttonVariants({ variant: "ghost" })}>Réinitialiser</Link> : null}
          </form>
          <p className="text-sm text-muted-foreground">{data.total} bordereau{data.total > 1 ? "x" : ""}</p>
        </CardContent>
        {data.movements.length === 0 ? (
          <CardContent><p className="text-sm text-muted-foreground">Aucun bordereau ne correspond à cette sélection.</p></CardContent>
        ) : (
          <div className="divide-y border-t">
            {data.movements.map((movement) => (
              <article key={movement.id} className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-mono font-semibold">{movement.reference}</h2>
                  <Badge variant="secondary">{getTransferMovementLabel(movement.type)}</Badge>
                  <Badge variant="outline">{getTransferMovementStatusLabel(movement.status)}</Badge>
                </div>
                <p className="text-sm">Lot {movement.transferLot.reference} · {movement.dossierCount} dossiers · {dateFormatter.format(movement.occurredAt)}</p>
                <p className="text-sm text-muted-foreground">{movement.type === "RETOUR" ? movement.transferLot.destinationSite.nom : movement.transferLot.sourceSite.nom} → {movement.type === "RETOUR" ? movement.transferLot.sourceSite.nom : movement.transferLot.destinationSite.nom}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/transferts/${movement.transferLot.id}/bordereaux/${movement.id}`} className={buttonVariants({ variant: "outline" })}><FileText /> Ouvrir le bordereau</Link>
                  <Link href={`/transferts/${movement.transferLot.id}`} className={buttonVariants({ variant: "outline" })}>Lot et suivi</Link>
                  {movement.type === "RECEPTION" && movement.status === (ministry ? "VALIDE_CEIBAC" : "SOUMIS_CEIBAC")
                    ? <ReceptionApprovalDialog movementId={movement.id} movementType={movement.type} stage={stage} /> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      <DataPagination basePath={basePath} page={data.page} totalPages={data.totalPages} searchParams={paginationParams} />
    </div>
  );
}
