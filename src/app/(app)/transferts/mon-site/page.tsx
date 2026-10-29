import Link from "next/link";
import { Download, FileText, MapPinned } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConvoySteps } from "@/components/transferts/ConvoySteps";
import { FieldLotStrip } from "@/components/transferts/FieldLotStrip";
import { SiteStepButton } from "@/components/transferts/SiteStepButton";
import { nextSiteStep } from "@/lib/transfers/convoy";
import { TransferMovementDialog } from "@/components/transferts/TransferActions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSiteWorkspace } from "@/lib/services/transfer-field-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mon site - Transferts - GeoArchives" };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Abidjan" });

const movementStatus: Record<string, { label: string; className: string }> = {
  SOUMIS_CEIBAC: { label: "Visa interne en attente", className: "border-brand-gold/40 text-brand-gold" },
  VALIDE_CEIBAC: { label: "Contre-signature SDA en attente", className: "border-brand-gold/40 text-brand-gold" },
  VALIDE_MINISTERE: { label: "Arrivée validée", className: "border-brand-green/40 text-brand-green" },
  REJETE: { label: "Rejeté", className: "border-destructive/40 text-destructive" },
};

const conditionLabel: Record<string, string> = {
  CONFORME: "Conforme",
  AVEC_RESERVES: "Avec réserves",
  NON_CONFORME: "Non conforme",
};

export default async function SiteWorkspacePage() {
  const { sites, departures, loadings, arrivals, bordereaux } = await getSiteWorkspace();

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        tone="transfer"
        icon={MapPinned}
        eyebrow="Transferts d'archives"
        title="Mon site"
        description={sites.length
          ? `Cartons à remettre et arrivées à constater pour ${sites.map((site) => site.nom).join(", ")}.`
          : "Aucun site ne vous est encore rattaché."}
        stats={[
          { label: "À remettre", value: departures.length },
          { label: "Chargements", value: loadings.length },
          { label: "Arrivées attendues", value: arrivals.length, tone: arrivals.length ? "warning" : "default" },
          { label: "Bordereaux d'arrivée", value: bordereaux.length },
        ]}
      />

      {sites.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Demandez à un administrateur de vous rattacher à votre site (Administration, Utilisateurs) : les départs et les arrivées de ce site apparaîtront ici.</CardContent></Card>
      ) : null}

      <section aria-labelledby="arrivees" className="space-y-3">
        <div>
          <h2 id="arrivees" className="text-lg font-semibold">Arrivées attendues</h2>
          <p className="text-sm text-muted-foreground">Vous êtes prévenu dès que le véhicule roule, avec l&apos;heure d&apos;arrivée estimée. À l&apos;arrivée, indiquez le début et la fin du déchargement, contrôlez les cartons et signez l&apos;état des lieux (PV F03).</p>
        </div>
        {arrivals.length ? arrivals.map((lot) => (
          <FieldLotStrip key={lot.id} lot={lot} highlight="destination">
            {lot.convoy.arrived ? (
              <p className="w-full rounded-md bg-brand-green/10 px-3 py-2 text-sm font-medium text-brand-green">Véhicule arrivé à {timeFormatter.format(lot.convoy.arrivedAt!)}{lot.convoy.arrivalAutomatic ? " (détecté par GPS)" : ""}</p>
            ) : lot.convoy.movingAt ? (
              <p className="w-full rounded-md bg-brand-gold/10 px-3 py-2 text-sm font-medium text-brand-gold">En route depuis {timeFormatter.format(lot.convoy.movingAt)}{lot.convoy.etaAt ? `, arrivée estimée vers ${timeFormatter.format(lot.convoy.etaAt)}` : ""} · <Link href={`/transferts/${lot.id}`} className="underline underline-offset-4">suivre le trajet</Link></p>
            ) : lot.convoy.onTheRoad ? (
              <p className="w-full rounded-md bg-muted px-3 py-2 text-sm font-medium">Fiche de départ remplie à {timeFormatter.format(lot.convoy.departedAt!)} : le véhicule n&apos;a pas encore quitté le site de départ.</p>
            ) : null}
            {lot.convoy.onTheRoad || lot.convoy.arrived ? <ConvoySteps state={lot.convoy} className="w-full rounded-md border p-3" /> : null}
            {(() => { const step = nextSiteStep("destination", lot.convoy); return step ? <SiteStepButton lotId={lot.id} step={step} /> : null; })()}
            {lot.items.length ? (
              <TransferMovementDialog lotId={lot.id} type="RECEPTION" items={lot.items} escortSuggestions={lot.escorts} sourceLabel={lot.source} destinationLabel={lot.destination} />
            ) : (
              <p className="text-sm text-muted-foreground">État des lieux déjà transmis, en cours de validation.</p>
            )}
          </FieldLotStrip>
        )) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun carton en route vers vos sites.</p>}
      </section>

      <section aria-labelledby="departs" className="space-y-3">
        <div>
          <h2 id="departs" className="text-lg font-semibold">Cartons à remettre</h2>
          <p className="text-sm text-muted-foreground">Lots autorisés qui partent de vos sites : remettez les cartons au convoyeur et signez le bordereau de sortie (F02).</p>
        </div>
        {departures.length ? departures.map((lot) => (
          <FieldLotStrip key={lot.id} lot={lot} highlight="source">
            <TransferMovementDialog lotId={lot.id} type="SORTIE" items={lot.items} escortSuggestions={lot.escorts} sourceLabel={lot.source} destinationLabel={lot.destination} />
          </FieldLotStrip>
        )) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun lot autorisé au départ de vos sites.</p>}
      </section>

      <section aria-labelledby="chargements" className="space-y-3">
        <div>
          <h2 id="chargements" className="text-lg font-semibold">Chargement et départ</h2>
          <p className="text-sm text-muted-foreground">Après l&apos;état des lieux de sortie, indiquez le début puis la fin du chargement : le convoyeur est prévenu, et le site d&apos;arrivée l&apos;est dès que le véhicule roule.</p>
        </div>
        {loadings.length ? loadings.map((lot) => {
          const step = nextSiteStep("source", lot.convoy);
          return (
            <FieldLotStrip key={lot.id} lot={lot} highlight="source">
              <ConvoySteps state={lot.convoy} className="w-full rounded-md border p-3" />
              {step ? <SiteStepButton lotId={lot.id} step={step} /> : (
                <p className="text-sm text-muted-foreground">{lot.convoy.onTheRoad ? "Fiche de départ remplie : en attente du mouvement du véhicule." : "Chargement terminé : le convoyeur remplit la fiche de départ."}</p>
              )}
            </FieldLotStrip>
          );
        }) : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun chargement en cours sur vos sites.</p>}
      </section>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Bordereaux d&apos;arrivée</CardTitle>
          <CardDescription>États des lieux signés à l&apos;arrivée, pour vos sites d&apos;arrivée comme pour les cartons partis de vos sites.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/60 p-0">
          {bordereaux.length ? bordereaux.map((movement) => {
            const status = movementStatus[movement.status] ?? { label: movement.status, className: "" };
            return (
              <div key={movement.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{movement.reference}</span>
                    <Badge variant="outline" className={cn("rounded-md", status.className)}>{status.label}</Badge>
                    {movement.incidentReported ? <Badge variant="outline" className="rounded-md border-destructive/40 text-destructive">Incident signalé</Badge> : null}
                  </div>
                  <p className="text-sm">{movement.from} vers {movement.to}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateFormatter.format(movement.occurredAt)}, {movement.cartons} carton{movement.cartons > 1 ? "s" : ""}, {movement.dossiers} dossier{movement.dossiers > 1 ? "s" : ""}
                    {movement.conditionStatus ? `, ${conditionLabel[movement.conditionStatus] ?? movement.conditionStatus}` : ""}
                    {movement.side === "DEPART" ? ". Envoyé depuis votre site" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/transferts/${movement.lot.id}/bordereaux/${movement.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><FileText /> Voir le F03</Link>
                  <a href={`/api/transferts/${movement.lot.id}/bordereaux/${movement.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><Download /> Télécharger</a>
                </div>
              </div>
            );
          }) : <p className="px-4 py-6 text-sm text-muted-foreground">Aucun état des lieux enregistré pour vos sites.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
