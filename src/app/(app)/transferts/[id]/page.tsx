import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, FileText, PackageCheck, Route, ShieldCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { AuthorizeTransferButton, TransferMovementDialog, type TransferMovementItemOption } from "@/components/transferts/TransferActions";
import { TransferItemStatusBadge, TransferLotStatusBadge } from "@/components/transferts/TransferStatusBadge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/current-user";
import { getTransferLotDetail } from "@/lib/services/transfer-service";
import {
  getTransferMovementLabel,
  getTransferStockSummary,
  type TransferItemStatusCode,
  type TransferLotStatusCode,
  type TransferMovementTypeCode,
} from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Lot ${id} - Transferts GeoArchives-MULCV` };
}

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [session, lot] = await Promise.all([
    requirePermission("TRANSFER_VIEW"),
    getTransferLotDetail(id),
  ]);
  if (!lot) notFound();

  const stock = getTransferStockSummary(lot.items.map((item) => item.status as TransferItemStatusCode));
  const canAuthorize = session.permissions.includes("TRANSFER_AUTHORIZE") && lot.status === "BROUILLON";
  const canOperate = session.permissions.includes("TRANSFER_OPERATE") && !["BROUILLON", "ANNULE", "CLOTURE"].includes(lot.status);
  const movementOptions = (status: TransferItemStatusCode): TransferMovementItemOption[] => lot.items
    .filter((item) => item.status === status)
    .map((item) => ({ id: item.id, cartonCode: item.cartonCode, cartonLabel: item.cartonLabel, dossierCount: item.dossierCountSnapshot }));

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Dossier de garde"
        icon={Truck}
        title={<span className="font-mono">{lot.reference}</span>}
        description={`${placeLabel(lot.sourceSite.nom, lot.sourceEntrepot?.nom)} vers ${placeLabel(lot.destinationSite.nom, lot.destinationEntrepot?.nom)}. La composition du lot reste figée pendant toute la circulation.`}
        actions={(
          <>
            <Link href="/transferts" className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Registre</Link>
            {canAuthorize ? <AuthorizeTransferButton lotId={lot.id} /> : null}
          </>
        )}
        stats={[
          { label: "Cartons du lot", value: stock.total },
          { label: "Encore sur site", value: stock.notDeparted },
          { label: "Hors site", value: stock.outsideOrigin, tone: stock.outsideOrigin > 0 ? "warning" : "success" },
          { label: "Retournés", value: stock.returned, tone: "success" },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Situation du stock</CardTitle>
                <CardDescription>Chaque carton ne peut avancer qu&apos;une fois par étape : sortie, réception CEIBAC, puis retour.</CardDescription>
              </div>
              <TransferLotStatusBadge status={lot.status as TransferLotStatusCode} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StockMetric label="Sur le site d'origine" value={stock.atOrigin} hint="non sorti + retourné" tone="default" />
            <StockMetric label="En transit" value={stock.inTransit} hint="sorti, non réceptionné" tone="warning" />
            <StockMetric label="Chez CEIBAC" value={stock.atCeibac} hint="réception confirmée" tone="success" />
            <StockMetric label="Dossiers liés" value={lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0)} hint="références figées" tone="default" />
          </CardContent>
        </Card>

        <Card className="bg-card/95">
          <CardHeader><CardTitle>Traçabilité</CardTitle><CardDescription>Responsables et jalons du dossier.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <TraceRow icon={CalendarClock} label="Créé" value={`${dateTimeFormatter.format(lot.createdAt)} par ${lot.createdBy.name}`} />
            <TraceRow icon={ShieldCheck} label="Autorisation" value={lot.authorizedAt && lot.authorizedBy ? `${dateTimeFormatter.format(lot.authorizedAt)} par ${lot.authorizedBy.name}` : "En attente"} />
            <TraceRow icon={Route} label="Transfert prévu" value={lot.plannedAt ? dateFormatter.format(lot.plannedAt) : "Non planifié"} />
          </CardContent>
        </Card>
      </div>

      {canOperate ? (
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>Enregistrer un mouvement</CardTitle>
            <CardDescription>Un bordereau distinct est produit pour chaque mouvement, y compris en cas de sortie ou de retour partiel.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <TransferMovementDialog lotId={lot.id} type="SORTIE" items={movementOptions("PREVU")} />
            <TransferMovementDialog lotId={lot.id} type="RECEPTION" items={movementOptions("SORTI")} />
            <TransferMovementDialog lotId={lot.id} type="RETOUR" items={movementOptions("RECU")} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle>Composition du lot</CardTitle><CardDescription>Inventaire exact des cartons et des dossiers au moment de la constitution.</CardDescription></div>
            <Badge variant="outline" className="rounded-md">{lot.items.length} carton{lot.items.length > 1 ? "s" : ""}</Badge>
          </div>
        </CardHeader>
        <div className="divide-y divide-border/60 lg:hidden">
          {lot.items.map((item) => (
            <article key={item.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono font-semibold">{item.cartonCode}</p><p className="mt-1 text-sm text-muted-foreground">{item.cartonLabel ?? "Carton sans libellé"}</p></div><TransferItemStatusBadge status={item.status as TransferItemStatusCode} /></div>
              <p className="text-xs leading-5 text-muted-foreground">{item.dossiers.map((entry) => entry.dossier.reference).join(" · ")}</p>
              <p className="text-xs font-medium">{item.dossierCountSnapshot} dossier{item.dossierCountSnapshot > 1 ? "s" : ""}</p>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <Table className="min-w-[900px]">
            <TableHeader><TableRow className="bg-muted/45 hover:bg-muted/45"><TableHead className="pl-5">Carton</TableHead><TableHead>Libellé</TableHead><TableHead>Dossiers figés</TableHead><TableHead className="text-center">Volume</TableHead><TableHead className="pr-5">Localisation</TableHead></TableRow></TableHeader>
            <TableBody>
              {lot.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-5 font-mono font-semibold">{item.cartonCode}</TableCell>
                  <TableCell>{item.cartonLabel ?? <span className="text-muted-foreground">Sans libellé</span>}</TableCell>
                  <TableCell className="max-w-lg"><p className="truncate text-xs text-muted-foreground" title={item.dossiers.map((entry) => entry.dossier.reference).join(" · ")}>{item.dossiers.map((entry) => entry.dossier.reference).join(" · ")}</p></TableCell>
                  <TableCell className="text-center font-semibold tabular-nums">{item.dossierCountSnapshot}</TableCell>
                  <TableCell className="pr-5"><TransferItemStatusBadge status={item.status as TransferItemStatusCode} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3"><div><CardTitle>Bordereaux et mouvements</CardTitle><CardDescription>Historique immuable des remises, réceptions et retours signés.</CardDescription></div><Badge variant="outline" className="rounded-md">{lot.movements.length}</Badge></div>
        </CardHeader>
        {lot.movements.length === 0 ? (
          <CardContent className="py-12 text-center"><PackageCheck className="mx-auto h-9 w-9 text-muted-foreground/55" /><p className="mt-3 font-medium">Aucun mouvement enregistré</p><p className="mt-1 text-sm text-muted-foreground">Le stock est toujours considéré sur son site d&apos;origine.</p></CardContent>
        ) : (
          <div className="divide-y divide-border/60">
            {lot.movements.map((movement) => (
              <article key={movement.id} className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="font-mono font-semibold">{movement.reference}</p><Badge variant="secondary" className="rounded-md">{getTransferMovementLabel(movement.type as TransferMovementTypeCode)}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{movementPlace(lot, movement.type as TransferMovementTypeCode, "from")} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {movementPlace(lot, movement.type as TransferMovementTypeCode, "to")} · {movement.items.length} carton{movement.items.length > 1 ? "s" : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{dateTimeFormatter.format(movement.occurredAt)} · saisi par {movement.createdBy.name} · visas {movement.signatures.map((signature) => signature.signatoryName).join(" / ")}</p>
                  </div>
                </div>
                <Link href={`/transferts/${lot.id}/bordereaux/${movement.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}><FileText /> Ouvrir le bordereau</Link>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function placeLabel(site: string, warehouse?: string | null) {
  return warehouse ? `${site} · ${warehouse}` : site;
}

function movementPlace(
  lot: { sourceSite: { nom: string }; sourceEntrepot: { nom: string } | null; destinationSite: { nom: string }; destinationEntrepot: { nom: string } | null },
  type: TransferMovementTypeCode,
  side: "from" | "to",
) {
  const source = placeLabel(lot.sourceSite.nom, lot.sourceEntrepot?.nom);
  const destination = placeLabel(lot.destinationSite.nom, lot.destinationEntrepot?.nom);
  const returns = type === "RETOUR";
  return side === "from" ? (returns ? destination : source) : (returns ? source : destination);
}

function StockMetric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "default" | "warning" | "success" }) {
  const toneClass = tone === "warning" ? "text-brand-gold" : tone === "success" ? "text-brand-green" : "text-primary";
  return <div className="rounded-lg border border-border/70 bg-muted/20 p-4"><p className="text-xs font-medium uppercase text-muted-foreground">{label}</p><p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
}

function TraceRow({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-0.5 font-medium">{value}</p></div></div>;
}
