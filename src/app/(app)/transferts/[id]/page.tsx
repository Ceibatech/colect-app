import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Download, FileText, PackageCheck, Route, ShieldCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApproveTransferLotByCeibacButton, AuthorizeTransferButton, ReceptionApprovalDialog, SubmitTransferButton, TransferMovementDialog, type TransferMovementItemOption } from "@/components/transferts/TransferActions";
import { ConvoyTrackingPanel } from "@/components/transferts/ConvoyTrackingPanel";
import { TransferItemStatusBadge, TransferLotStatusBadge } from "@/components/transferts/TransferStatusBadge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { canSignMovementAtSite } from "@/lib/transfers/site-scope";
import { getTransferLotDetail } from "@/lib/services/transfer-service";
import { formatCartonReference } from "@/lib/cartons/reference";
import {
  getTransferMovementLabel,
  getTransferMovementStatusLabel,
  getTransferDossierStockSummary,
  type TransferItemStatusCode,
  type TransferLotStatusCode,
  type TransferMovementTypeCode,
  type TransferMovementStatusCode,
} from "@/lib/utils/transfer-stock";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Lot ${id} - Transferts GeoArchives` };
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

  const escortSuggestions = lot.participants.filter((participant) => participant.roleCode === "CONVOYEUR").map((participant) => participant.user.name);
  const sourceLabel = placeLabel(lot.sourceSite.nom, lot.sourceEntrepot);
  const destinationLabel = placeLabel(lot.destinationSite.nom, lot.destinationEntrepot);
  const stock = getTransferDossierStockSummary(lot.items.map((item) => ({
    status: item.status as TransferItemStatusCode,
    dossierCountSnapshot: item.dossierCountSnapshot,
  })));
  const canSubmit = session.permissions.includes("TRANSFER_SUBMIT") && lot.status === "BROUILLON";
  const canApproveCeibac = session.permissions.includes("TRANSFER_CEIBAC_APPROVE") && lot.status === "SOUMIS";
  const canAuthorize = session.permissions.includes("TRANSFER_AUTHORIZE") && lot.status === "VALIDE_CEIBAC";
  const responsibleSiteIds = session.roleCode === "RESPONSABLE_SITE"
    ? (await prisma.userSite.findMany({ where: { userId: session.userId }, select: { siteId: true } })).map((row) => row.siteId)
    : null;
  const canSignAt = (type: "SORTIE" | "RECEPTION" | "RETOUR") => canSignMovementAtSite(type, lot, responsibleSiteIds);
  const canOperate = session.permissions.includes("TRANSFER_OPERATE") && !["BROUILLON", "SOUMIS", "VALIDE_CEIBAC", "ANNULE", "CLOTURE"].includes(lot.status)
    && (["SORTIE", "RECEPTION", "RETOUR"] as const).some(canSignAt);
  const canTrack = session.permissions.includes("TRANSFER_TRACK");
  const canValidateCeiba = session.permissions.includes("TRANSFER_CEIBAC_VALIDATE");
  const canValidateMinistry = session.permissions.includes("TRANSFER_AUTHORIZE");
  const pendingMovementItemIds = new Set(lot.movements
    .filter((movement) => ["SOUMIS_CEIBAC", "VALIDE_CEIBAC"].includes(movement.status))
    .flatMap((movement) => movement.items.map((entry) => entry.transferLotItem.id)));
  const movementOptions = (status: TransferItemStatusCode): TransferMovementItemOption[] => lot.items
    .filter((item) => item.status === status && !pendingMovementItemIds.has(item.id))
    .map((item) => ({ id: item.id, cartonCode: item.cartonId == null ? item.cartonCode : formatCartonReference(item.cartonId), cartonLabel: item.cartonLabel, dossierCount: item.dossierCountSnapshot }));
  const dossierRows = lot.items.flatMap((item) => item.dossiers.map((entry) => ({
    ...entry.dossier,
    cartonCode: item.cartonId != null ? formatCartonReference(item.cartonId) : item.cartonCode.startsWith("DOSSIER-") ? null : item.cartonCode,
    cartonLabel: [item.cartonId != null && item.cartonCode !== formatCartonReference(item.cartonId) ? item.cartonCode : null, item.cartonLabel].filter(Boolean).join(" · ") || null,
    status: item.status as TransferItemStatusCode,
  })));

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Dossier de garde"
        icon={Truck}
        title={<span className="font-mono">{lot.reference}</span>}
        description={`${sourceLabel} vers ${destinationLabel}. Les dossiers sélectionnés restent figés pendant toute la chaîne de garde.`}
        actions={(
          <>
            <Link href="/transferts" className={cn(buttonVariants({ variant: "outline" }))}><ArrowLeft /> Registre</Link>
            <Link href={`/transferts/${lot.id}/autorisation`} className={cn(buttonVariants({ variant: "outline" }))}><FileText /> Fiche du lot</Link>
            {lot.authorizedAt ? <Link href="/transferts#documents" className={cn(buttonVariants({ variant: "outline" }))}><Download /> F01 consolidée</Link> : null}
            {canValidateMinistry ? <Link href="/transferts/validation" className={buttonVariants({ variant: "outline" })}>Validation SDA</Link> : null}
            {session.permissions.includes("TRANSFER_CEIBAC_APPROVE") ? <Link href="/transferts/validation-ceibac" className={buttonVariants({ variant: "outline" })}>Validation interne</Link> : null}
            {canSubmit ? <SubmitTransferButton lotId={lot.id} /> : null}
            {canApproveCeibac ? <ApproveTransferLotByCeibacButton lotId={lot.id} /> : null}
            {canAuthorize ? <AuthorizeTransferButton lotId={lot.id} /> : null}
          </>
        )}
        stats={[
          { label: "Dossiers du lot", value: stock.total },
          { label: "Au site du ministère", value: stock.notDeparted },
          { label: "En circulation", value: stock.outsideOrigin, tone: stock.outsideOrigin > 0 ? "warning" : "success" },
          { label: "Retournés au ministère", value: stock.returned, tone: "success" },
        ]}
        tone="transfer"
      />

      <TransferWorkflow submitted={!!lot.submittedAt} ceibacApproved={!!lot.ceibacValidatedAt} authorized={!!lot.authorizedAt} hasDeparture={lot.items.some((item) => item.status !== "PREVU")} hasArrival={lot.items.some((item) => item.status === "RECU" || item.status === "RETOURNE")} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Situation du stock</CardTitle>
                <CardDescription>Le stock du site de destination n&apos;augmente qu&apos;après les validations interne et SDA du constat de réception.</CardDescription>
              </div>
              <TransferLotStatusBadge status={lot.status as TransferLotStatusCode} />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StockMetric label="Site du ministère" value={stock.atOrigin} hint="non sorti + retourné" tone="default" />
            <StockMetric label="En transit" value={stock.inTransit} hint="sorti, non réceptionné" tone="warning" />
            <StockMetric label="À destination" value={stock.atDestination} hint="réception confirmée" tone="success" />
            <StockMetric label="Dossiers identifiés" value={stock.total} hint="composition figée" tone="default" />
          </CardContent>
        </Card>

        <Card className="bg-card/95">
          <CardHeader><CardTitle>Traçabilité</CardTitle><CardDescription>Responsables et jalons du dossier.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <TraceRow icon={CalendarClock} label="Créé" value={`${dateTimeFormatter.format(lot.createdAt)} par ${lot.createdBy.name}`} />
            <TraceRow icon={ShieldCheck} label="Validation interne" value={lot.ceibacValidatedAt ? `${dateTimeFormatter.format(lot.ceibacValidatedAt)} par ${lot.ceibacSignatoryName ?? "Responsable interne"}` : lot.authorizedAt ? "Ancien circuit : validation interne non enregistrée" : "En attente"} />
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
            {canSignAt("SORTIE") ? <TransferMovementDialog lotId={lot.id} type="SORTIE" escortSuggestions={escortSuggestions} items={movementOptions("PREVU")} sourceLabel={sourceLabel} destinationLabel={destinationLabel} /> : null}
            {canSignAt("RECEPTION") ? <TransferMovementDialog lotId={lot.id} type="RECEPTION" escortSuggestions={escortSuggestions} items={movementOptions("SORTI")} sourceLabel={sourceLabel} destinationLabel={destinationLabel} /> : null}
            {canSignAt("RETOUR") ? <TransferMovementDialog lotId={lot.id} type="RETOUR" escortSuggestions={escortSuggestions} items={movementOptions("RECU")} sourceLabel={sourceLabel} destinationLabel={destinationLabel} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {lot.items.some((item) => item.departedAt !== null) ? <ConvoyTrackingPanel lotId={lot.id} canTrack={canTrack && stock.inTransit > 0} mapsKey={process.env.GOOGLE_MAPS_API_KEY ?? null} /> : null}

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle>Dossiers identifiés</CardTitle><CardDescription>Inventaire exact des dossiers approuvés pour ce transfert.</CardDescription></div>
            <Badge variant="outline" className="rounded-md">{dossierRows.length} dossier{dossierRows.length > 1 ? "s" : ""}</Badge>
          </div>
        </CardHeader>
        <div className="divide-y divide-border/60 lg:hidden">
          {dossierRows.map((dossier) => (
            <article key={dossier.id} className="space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3"><div><p className="font-mono font-semibold">{dossier.reference}</p><p className="mt-1 text-sm text-muted-foreground">{[dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné"}</p></div><TransferItemStatusBadge status={dossier.status} /></div>
              <p className="text-xs leading-5 text-muted-foreground">{dossier.cartonCode ?? "Sans code-barres"}{dossier.cartonLabel ? ` · ${dossier.cartonLabel}` : ""}</p>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <Table className="min-w-[900px]">
            <TableHeader><TableRow className="bg-muted/45 hover:bg-muted/45"><TableHead className="pl-5">Dossier</TableHead><TableHead>Titulaire</TableHead><TableHead>ID carton</TableHead><TableHead>Identification historique</TableHead><TableHead className="pr-5">Situation</TableHead></TableRow></TableHeader>
            <TableBody>
              {dossierRows.map((dossier) => (
                <TableRow key={dossier.id}>
                  <TableCell className="pl-5 font-mono font-semibold">{dossier.reference}</TableCell>
                  <TableCell>{[dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || <span className="text-muted-foreground">Non renseigné</span>}</TableCell>
                  <TableCell className="font-mono text-sm">{dossier.cartonCode ?? <span className="font-sans text-muted-foreground">Sans code-barres</span>}</TableCell>
                  <TableCell>{dossier.cartonLabel ?? <span className="text-muted-foreground">Sans libellé</span>}</TableCell>
                  <TableCell className="pr-5"><TransferItemStatusBadge status={dossier.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card id="bordereaux" className="scroll-mt-20 bg-card/95">
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
                    <div className="flex flex-wrap items-center gap-2"><p className="font-mono font-semibold">{movement.reference}</p><Badge variant="secondary" className="rounded-md">{getTransferMovementLabel(movement.type as TransferMovementTypeCode)}</Badge><Badge variant="outline" className="rounded-md">{getTransferMovementStatusLabel(movement.status as TransferMovementStatusCode)}</Badge>{movement.conditionStatus ? <Badge variant="outline" className="rounded-md">{conditionLabel(movement.conditionStatus)}</Badge> : null}{movement.incidentReported ? <Badge variant="destructive" className="rounded-md">Incident signalé</Badge> : null}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{movementPlace(lot, movement.type as TransferMovementTypeCode, "from")} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {movementPlace(lot, movement.type as TransferMovementTypeCode, "to")} · {movement.items.reduce((sum, item) => sum + item.transferLotItem.dossierCountSnapshot, 0)} dossier{movement.items.reduce((sum, item) => sum + item.transferLotItem.dossierCountSnapshot, 0) > 1 ? "s" : ""}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{dateTimeFormatter.format(movement.occurredAt)} · saisi par {movement.createdBy.name} · visas {movement.signatures.map((signature) => signature.signatoryName).join(" / ")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {movement.status === "SOUMIS_CEIBAC" && canValidateCeiba ? <ReceptionApprovalDialog movementId={movement.id} movementType={movement.type as TransferMovementTypeCode} stage="CEIBA" /> : null}
                  {movement.status === "VALIDE_CEIBAC" && canValidateMinistry ? <ReceptionApprovalDialog movementId={movement.id} movementType={movement.type as TransferMovementTypeCode} stage="MINISTERE" /> : null}
                  <Link href={`/transferts/${lot.id}/bordereaux/${movement.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><FileText /> Prévisualiser {movement.type === "RECEPTION" ? "F03" : "F02"}</Link>
                  <a href={`/api/transferts/${lot.id}/bordereaux/${movement.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Download /> Télécharger {movement.type === "RECEPTION" ? "F03" : "F02"}</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function TransferWorkflow({ submitted, ceibacApproved, authorized, hasDeparture, hasArrival }: { submitted: boolean; ceibacApproved: boolean; authorized: boolean; hasDeparture: boolean; hasArrival: boolean }) {
  const steps = [
    { label: "Lot soumis", detail: "Gestionnaire", complete: submitted },
    { label: "Validation interne", detail: "Responsable interne", complete: ceibacApproved },
    { label: "Sortie autorisée", detail: "Validation SDA", complete: authorized },
    { label: "Acheminement", detail: "Bordereau + GPS", complete: hasDeparture },
    { label: "Réception validée", detail: "Validation interne + SDA", complete: hasArrival },
  ];
  return (
    <Card className="bg-card/95">
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => <div key={step.label} className="flex min-h-20 items-center gap-3 rounded-md border bg-muted/15 p-3"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", step.complete ? "border-brand-green/30 bg-brand-green/10 text-brand-green" : "border-border bg-background text-muted-foreground")}>{step.complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span><div><p className="font-medium">{step.label}</p><p className="text-xs text-muted-foreground">{step.detail}</p></div></div>)}
      </CardContent>
    </Card>
  );
}

function conditionLabel(status: "CONFORME" | "AVEC_RESERVES" | "NON_CONFORME") {
  return { CONFORME: "Chargement conforme", AVEC_RESERVES: "Avec réserves", NON_CONFORME: "Non conforme" }[status];
}

function placeLabel(site: string, warehouse?: { nom: string; localisation: string | null } | null) {
  return warehouse ? [site, warehouse.nom, warehouse.localisation].filter(Boolean).join(" · ") : site;
}

function movementPlace(
  lot: { sourceSite: { nom: string }; sourceEntrepot: { nom: string; localisation: string | null } | null; destinationSite: { nom: string }; destinationEntrepot: { nom: string; localisation: string | null } | null },
  type: TransferMovementTypeCode,
  side: "from" | "to",
) {
  const source = placeLabel(lot.sourceSite.nom, lot.sourceEntrepot);
  const destination = placeLabel(lot.destinationSite.nom, lot.destinationEntrepot);
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
