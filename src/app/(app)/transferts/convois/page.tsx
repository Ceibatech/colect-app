import { Navigation, Route, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConvoyDepartureForm } from "@/components/transferts/ConvoyDepartureForm";
import { ConvoyTrackingPanel } from "@/components/transferts/ConvoyTrackingPanel";
import { FieldLotStrip } from "@/components/transferts/FieldLotStrip";
import { TraccarSetup } from "@/components/transferts/TraccarSetup";
import { buttonVariants } from "@/components/ui/button";
import { getConvoyWorkspace } from "@/lib/services/transfer-field-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mes convois - Transferts - GeoArchives" };

/**
 * Espace du convoyeur, sur son téléphone : fiche de départ (véhicule, cartons
 * scannés, scellés), puis « Démarrer le trajet » qui prévient les deux sites et
 * lance le suivi. Navigation vocale et embouteillages : Waze ou Google Maps.
 */
export default async function ConvoysPage() {
  const convoys = await getConvoyWorkspace();
  const loaded = convoys.filter((convoy) => convoy.inTransit > 0);
  const waiting = convoys.filter((convoy) => convoy.inTransit === 0);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        tone="transfer"
        icon={Truck}
        eyebrow="Transferts d'archives"
        title="Mes convois"
        description="Remplissez la fiche de départ, démarrez le trajet, puis laissez-vous guider par Waze ou Google Maps. Vos positions sont transmises jusqu'à l'arrivée."
        stats={[
          { label: "En route", value: loaded.filter((convoy) => convoy.convoy.onTheRoad).length, tone: "warning" },
          { label: "Prêts à partir", value: loaded.filter((convoy) => !convoy.convoy.onTheRoad && !convoy.convoy.arrived).length },
          { label: "En attente de chargement", value: waiting.length },
        ]}
      />

      {convoys.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun convoi ne vous est confié pour le moment. Les lots où vous êtes désigné convoyeur apparaîtront ici dès leur autorisation.</p>
      ) : null}

      {loaded.map((convoy) => {
        const started = convoy.convoy.onTheRoad || convoy.convoy.arrived;
        return (
          <section key={convoy.id} id={`lot-${convoy.id}`} className="space-y-3">
            <FieldLotStrip lot={convoy} highlight="destination">
              <a href={convoy.wazeUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants())}><Navigation /> Waze</a>
              <a href={convoy.navigationUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }))}><Navigation /> Google Maps</a>
            </FieldLotStrip>
            {convoy.plannedRoute ? (
              <p className="flex gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm"><Route className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> <span>{convoy.plannedRoute}</span></p>
            ) : null}
            {started ? null : <ConvoyDepartureForm lotId={convoy.id} cartons={convoy.loadedCartons} prefill={convoy.prefill} />}
            {started ? <ConvoyTrackingPanel lotId={convoy.id} canTrack autoWatch mapsKey={process.env.GOOGLE_MAPS_API_KEY ?? null} /> : null}
          </section>
        );
      })}

      {loaded.length ? <TraccarSetup /> : null}

      {waiting.length ? (
        <section aria-labelledby="attente" className="space-y-3">
          <div>
            <h2 id="attente" className="text-lg font-semibold">En attente de chargement</h2>
            <p className="text-sm text-muted-foreground">La fiche de départ s&apos;ouvre quand le responsable du site de départ a remis les cartons (bordereau F02 contre-signé).</p>
          </div>
          {waiting.map((convoy) => (
            <FieldLotStrip key={convoy.id} lot={convoy} highlight="destination">
              <a href={convoy.navigationUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }))}><Navigation /> Voir le trajet</a>
            </FieldLotStrip>
          ))}
        </section>
      ) : null}
    </div>
  );
}
