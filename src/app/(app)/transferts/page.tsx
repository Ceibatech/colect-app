import Link from "next/link";
import { ArrowRight, BookOpenCheck, Boxes, Building2, MapPin, Plus, Truck, Container } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TransferLotStatusBadge } from "@/components/transferts/TransferStatusBadge";
import { TransferDocumentRegistry, type TransferDocumentItem } from "@/components/transferts/TransferDocumentRegistry";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/current-user";
import { getTransferDashboardData } from "@/lib/services/transfer-service";
import { getTransferAuthorizationGroupDownloadHref, groupTransferAuthorizationRows } from "@/lib/transfers/authorization-groups";
import type { TransferLotStatusCode } from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

export const metadata = { title: "Transferts d'archives - GeoArchives" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function TransfersPage() {
  const [session, data] = await Promise.all([
    requirePermission("TRANSFER_VIEW"),
    getTransferDashboardData(),
  ]);
  const canCreate = session.permissions.includes("TRANSFER_CREATE");
  const canAuthorize = session.permissions.includes("TRANSFER_AUTHORIZE");
  const canOperate = session.permissions.includes("TRANSFER_OPERATE");
  const canApproveCeiba = session.permissions.includes("TRANSFER_CEIBAC_APPROVE");
  const canValidateCeiba = session.permissions.includes("TRANSFER_CEIBAC_VALIDATE");
  const isCeibaValidator = session.roleCode === "VALIDATEUR_CEIBAC";
  const canAccessSignedDocuments = canAuthorize || canOperate || canApproveCeiba || canValidateCeiba;
  const authorizationGroups = groupTransferAuthorizationRows(data.rows);
  const documentTasks: TransferDocumentItem[] = [
    ...(canApproveCeiba ? data.rows
      .filter((row) => row.status === "SOUMIS")
      .map((row) => ({
        key: `F01-CEIBA-${row.id}`,
        code: "F01",
        title: `Lot ${row.reference} à contrôler`,
        detail: "L'opération attend la validation interne avant sa transmission au SDA.",
        status: "Validation interne requise",
        state: "CEIBA_ACTION",
        actionHref: `/transferts/${row.id}`,
        downloadHref: null,
      } satisfies TransferDocumentItem)) : []),
    ...(canAuthorize ? data.rows
      .filter((row) => row.status === "VALIDE_CEIBAC")
      .map((row) => ({
        key: `F01-MINISTRY-${row.id}`,
        code: "F01",
        title: `Autorisation ${row.reference} à signer`,
        detail: "L'opération validée en interne attend l'autorisation du SDA.",
        status: "Validation SDA requise",
        state: "MINISTRY_ACTION",
        actionHref: `/transferts/${row.id}`,
        downloadHref: null,
      } satisfies TransferDocumentItem)) : []),
    ...(canAuthorize ? data.rows.flatMap((row) => row.movements
      .filter((movement) => movement.status === "VALIDE_CEIBAC")
      .map((movement) => ({
        key: `F02-MINISTRY-${movement.id}`,
        code: movement.type === "RECEPTION" ? "F03" : "F02",
        title: `${movement.reference} à contre-signer`,
        detail: `${row.reference} · bordereau préparé et validé en interne`,
        status: "Validation SDA requise",
        state: "MINISTRY_ACTION",
        actionHref: `/transferts/${row.id}#bordereaux`,
        downloadHref: `/api/transferts/${row.id}/bordereaux/${movement.id}`,
      } satisfies TransferDocumentItem))) : []),
    ...(canValidateCeiba ? data.rows.flatMap((row) => row.movements
      .filter((movement) => movement.status === "SOUMIS_CEIBAC")
      .map((movement) => ({
        key: `F02-CEIBA-${movement.id}`,
        code: "F03",
        title: `${movement.reference} à contrôler`,
        detail: `${row.reference} · constat d'arrivée soumis par l'agent CEIBA`,
        status: "Validation interne requise",
        state: "CEIBA_ACTION",
        actionHref: `/transferts/${row.id}#bordereaux`,
        downloadHref: `/api/transferts/${row.id}/bordereaux/${movement.id}`,
      } satisfies TransferDocumentItem))) : []),
    ...(canAccessSignedDocuments ? authorizationGroups
      .filter((group) => group.fullyAuthorized)
      .map((group) => ({
        key: `F01-OPERATION-${group.key}`,
        code: "F01",
        title: `Autorisation du ${dateFormatter.format(group.plannedAt)} disponible`,
        detail: `${group.lotCount} lot${group.lotCount > 1 ? "s" : ""} · ${group.cartonCount} carton${group.cartonCount > 1 ? "s" : ""} · ${group.dossierCount} dossier${group.dossierCount > 1 ? "s" : ""} · ${group.source} vers ${group.destination}`,
        status: "Document signé",
        state: "SIGNED",
        actionHref: `/transferts/${group.rows[0].id}`,
        downloadHref: getTransferAuthorizationGroupDownloadHref(group),
      } satisfies TransferDocumentItem)) : []),
    ...(canAccessSignedDocuments ? data.rows.flatMap((row) => row.movements
      .filter((movement) => movement.status === "VALIDE_MINISTERE")
      .map((movement) => ({
        key: `F02-FINAL-${movement.id}`,
        code: movement.type === "RECEPTION" ? "F03" : "F02",
        title: `${movement.reference} signé`,
        detail: `${row.reference} · copie finale contre-signée par le ministère`,
        status: "Document final",
        state: "SIGNED",
        actionHref: `/transferts/${row.id}#bordereaux`,
        downloadHref: `/api/transferts/${row.id}/bordereaux/${movement.id}`,
      } satisfies TransferDocumentItem))) : []),
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow={isCeibaValidator ? "Transferts d'archives" : "Chaîne de garde"}
        icon={Truck}
        title={isCeibaValidator ? "Validation" : "Registre des transferts"}
        description={isCeibaValidator
          ? "Contrôlez les opérations soumises et les constats d'arrivée avant leur transmission au SDA."
          : "Vue consolidée du stock documentaire entre les sites d'inventaire du ministère et les sites de traitement CEIBA."}
        actions={(
          <>
            <Link href="/transferts/procedure" className={buttonVariants({ variant: "outline" })}><BookOpenCheck /> Procédure</Link>
            {canApproveCeiba ? <Link href="/transferts/validation-ceibac" className={buttonVariants({ variant: "outline" })}>Validation</Link> : null}
            {canAuthorize ? <Link href="/transferts/validation" className={buttonVariants({ variant: "outline" })}>Validation SDA</Link> : null}
            {session.permissions.includes("TRANSFER_OPERATE") ? <Link href="/caisses" className={buttonVariants({ variant: "outline" })}><Container /> Conteneurs de transport</Link> : null}
            {canCreate ? (
              <Link href="/transferts/nouveau" className={buttonVariants()}>
                <Plus /> Identifier un lot
              </Link>
            ) : null}
          </>
        )}
        stats={[
          { label: "Dossiers inventoriés", value: data.summary.totalDossiers },
          { label: "En stock sur site", value: data.summary.onSite, tone: "success" },
          { label: "En transit", value: data.summary.inTransit, tone: data.summary.inTransit > 0 ? "warning" : "success" },
          { label: "Sans emplacement", value: data.summary.unlocated, tone: data.summary.unlocated > 0 ? "warning" : "success" },
        ]}
        tone="transfer"
      />

      <TransferDocumentRegistry documents={documentTasks} />

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
            <div><CardTitle>Stock physique par site</CardTitle><CardDescription>Situation actuelle calculée depuis l&apos;emplacement de chaque dossier et les bordereaux en cours.</CardDescription></div>
          </div>
        </CardHeader>
        <div className="divide-y divide-border/60 lg:hidden">
          {data.siteStock.map((site) => (
            <article key={site.id} className="space-y-3 p-4 sm:p-5">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{site.nom}</p><Badge variant="outline" className="rounded-md">{site.organisation === "CEIBA" ? "CEIBA" : site.organisation === "MINISTERE" ? "Ministère" : "Autre"}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{site.code}</p></div>
              <div className="grid grid-cols-2 gap-3 border-y border-border/60 py-3 text-sm">
                <Metric label="Stock sur site" value={site.onSite} />
                <Metric label="Départs prévus" value={site.plannedOutbound} />
                <Metric label="Sorties en transit" value={site.transitOutbound} />
                <Metric label="Arrivées en transit" value={site.transitInbound} />
              </div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <Table className="min-w-[820px]">
            <TableHeader><TableRow className="bg-muted/45 hover:bg-muted/45"><TableHead className="pl-5">Site</TableHead><TableHead className="text-center">Stock actuel</TableHead><TableHead className="text-center">Départs prévus</TableHead><TableHead className="text-center">Sorties en transit</TableHead><TableHead className="pr-5 text-center">Arrivées en transit</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.siteStock.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="pl-5"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{site.nom}</p><Badge variant="outline" className="rounded-md">{site.organisation === "CEIBA" ? "CEIBA" : site.organisation === "MINISTERE" ? "Ministère" : "Autre"}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{site.code}</p></TableCell>
                  <TableCell className="text-center text-lg font-semibold tabular-nums text-primary">{site.onSite}</TableCell>
                  <TableCell className="text-center font-medium tabular-nums">{site.plannedOutbound}</TableCell>
                  <TableCell className="text-center font-medium tabular-nums text-brand-gold">{site.transitOutbound}</TableCell>
                  <TableCell className="pr-5 text-center font-medium tabular-nums text-brand-green">{site.transitInbound}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Lots et mouvements de stock</CardTitle>
              <CardDescription>Chaque opération conserve la liste exacte des cartons sélectionnés, leur contenu figé et tous les bordereaux signés.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="w-fit rounded-md">{data.summary.totalDossiers} dossiers inventoriés</Badge>
              <Badge variant={data.summary.open > 0 ? "secondary" : "outline"} className="w-fit rounded-md">{data.summary.open} lot{data.summary.open > 1 ? "s" : ""} ouvert{data.summary.open > 1 ? "s" : ""}</Badge>
              <Badge variant={data.summary.inTransit > 0 ? "secondary" : "outline"} className="w-fit rounded-md">{data.summary.inTransit} dossier{data.summary.inTransit > 1 ? "s" : ""} en transit</Badge>
            </div>
          </div>
        </CardHeader>

        {data.rows.length === 0 ? (
          <CardContent className="py-14 text-center">
            <Boxes className="mx-auto h-10 w-10 text-muted-foreground/55" />
            <p className="mt-3 font-medium">Aucun lot constitué</p>
            <p className="mt-1 text-sm text-muted-foreground">Les dossiers restent dans le stock de leur site jusqu&apos;au premier bordereau de sortie signé.</p>
          </CardContent>
        ) : (
          <>
            <div className="divide-y divide-border/60 lg:hidden">
              {data.rows.map((row) => (
                <Link key={row.id} href={`/transferts/${row.id}`} className="block space-y-4 p-4 transition-colors hover:bg-accent/25 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-foreground">{row.reference}</p>
                      <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" />{row.source}</p>
                    </div>
                    <TransferLotStatusBadge status={row.status as TransferLotStatusCode} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 border-y border-border/60 py-3 text-sm">
                    <Metric label="Dossiers" value={row.stock.total} />
                    <Metric label="En circulation" value={row.stock.outsideOrigin} />
                    <Metric label="À destination" value={row.stock.atDestination} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{row.destination}</span>
                    <span>{dateFormatter.format(row.plannedAt ?? row.createdAt)}</span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow className="bg-muted/45 hover:bg-muted/45">
                    <TableHead className="pl-5">Lot</TableHead>
                    <TableHead>Trajet</TableHead>
                    <TableHead className="text-center">Dossiers</TableHead>
                    <TableHead className="text-center">En circulation</TableHead>
                    <TableHead className="text-center">À destination</TableHead>
                    <TableHead>Mouvements</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead className="pr-5 text-right">Accès</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-accent/25">
                      <TableCell className="pl-5">
                        <p className="font-mono font-semibold">{row.reference}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Prévu le {dateFormatter.format(row.plannedAt ?? row.createdAt)}</p>
                      </TableCell>
                      <TableCell className="max-w-80">
                        <p className="truncate font-medium">{row.source}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><ArrowRight className="h-3 w-3" />{row.destination}</p>
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">{row.stock.total}</TableCell>
                      <TableCell className="text-center font-semibold tabular-nums text-brand-gold">{row.stock.outsideOrigin}</TableCell>
                      <TableCell className="text-center font-semibold tabular-nums text-brand-green">{row.stock.atDestination}</TableCell>
                      <TableCell><span className="tabular-nums">{row.movementCount}</span><span className="text-muted-foreground"> bordereau{row.movementCount > 1 ? "x" : ""}</span></TableCell>
                      <TableCell><TransferLotStatusBadge status={row.status as TransferLotStatusCode} /></TableCell>
                      <TableCell className="pr-5 text-right">
                        <Link href={`/transferts/${row.id}`} className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label={`Ouvrir ${row.reference}`}>
                          <ArrowRight />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}
