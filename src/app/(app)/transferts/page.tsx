import Link from "next/link";
import { ArrowRight, Boxes, MapPin, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { TransferLotStatusBadge } from "@/components/transferts/TransferStatusBadge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/current-user";
import { getTransferDashboardData } from "@/lib/services/transfer-service";
import type { TransferLotStatusCode } from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

export const metadata = { title: "Transferts d'archives - GeoArchives-MULCV" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export default async function TransfersPage() {
  const [session, data] = await Promise.all([
    requirePermission("TRANSFER_VIEW"),
    getTransferDashboardData(),
  ]);
  const canCreate = session.permissions.includes("TRANSFER_CREATE");

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Chaîne de garde"
        icon={Truck}
        title="Registre des transferts"
        description="Vue ministère du stock documentaire : cartons identifiés dans la base, encore sur site, en transit ou pris en charge par CEIBAC. Chaque mouvement reste lié à un bordereau signé."
        actions={canCreate ? (
          <Link href="/transferts/nouveau" className={buttonVariants()}>
            <Plus /> Identifier un lot
          </Link>
        ) : null}
        stats={[
          { label: "Cartons identifiés", value: data.summary.totalCartons },
          { label: "Encore sur site", value: data.summary.onSite, tone: "success" },
          { label: "Sortis du site", value: data.summary.outsideOrigin, tone: data.summary.outsideOrigin > 0 ? "warning" : "success" },
          { label: "Chez CEIBAC", value: data.summary.atCeibac, tone: "success" },
        ]}
      />

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Lots et mouvements de stock</CardTitle>
              <CardDescription>Un carton représente une unité de stock et rattache automatiquement tous ses dossiers identifiés dans la base.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="w-fit rounded-md">{data.summary.identifiedDossiers} dossiers rattachés</Badge>
              <Badge variant={data.summary.open > 0 ? "secondary" : "outline"} className="w-fit rounded-md">{data.summary.open} lot{data.summary.open > 1 ? "s" : ""} ouvert{data.summary.open > 1 ? "s" : ""}</Badge>
              <Badge variant={data.summary.inTransit > 0 ? "secondary" : "outline"} className="w-fit rounded-md">{data.summary.inTransit} carton{data.summary.inTransit > 1 ? "s" : ""} en transit</Badge>
            </div>
          </div>
        </CardHeader>

        {data.rows.length === 0 ? (
          <CardContent className="py-14 text-center">
            <Boxes className="mx-auto h-10 w-10 text-muted-foreground/55" />
            <p className="mt-3 font-medium">Aucun lot constitué</p>
            <p className="mt-1 text-sm text-muted-foreground">Le stock identifié reste entièrement sur les sites du ministère jusqu&apos;au premier bordereau de sortie.</p>
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
                    <Metric label="Cartons" value={row.stock.total} />
                    <Metric label="Hors site" value={row.stock.outsideOrigin} />
                    <Metric label="Retournés" value={row.stock.returned} />
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
                    <TableHead className="text-center">Cartons</TableHead>
                    <TableHead className="text-center">Hors site</TableHead>
                    <TableHead className="text-center">Chez CEIBAC</TableHead>
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
                      <TableCell className="text-center font-semibold tabular-nums text-brand-green">{row.stock.atCeibac}</TableCell>
                      <TableCell><span className="tabular-nums">{row.movementCount}</span><span className="text-muted-foreground"> · {row.dossierCount} dossiers</span></TableCell>
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
