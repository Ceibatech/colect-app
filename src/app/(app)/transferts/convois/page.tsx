import { Navigation, Route, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConvoyTrackingPanel } from "@/components/transferts/ConvoyTrackingPanel";
import { FieldLotStrip } from "@/components/transferts/FieldLotStrip";
import { buttonVariants } from "@/components/ui/button";
import { getConvoyWorkspace } from "@/lib/services/transfer-field-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mes convois - Transferts - GeoArchives" };

export default async function ConvoysPage() {
  const convoys = await getConvoyWorkspace();
  const onTheRoad = convoys.filter((convoy) => convoy.inTransit > 0);
  const waiting = convoys.filter((convoy) => convoy.inTransit === 0);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        tone="transfer"
        icon={Truck}
        eyebrow="Transferts d'archives"
        title="Mes convois"
        description="Suivez le trajet des cartons jusqu'au site d'arrivée. Gardez cette page ouverte pendant le trajet pour transmettre votre position."
        stats={[
          { label: "En route", value: onTheRoad.length, tone: onTheRoad.length ? "warning" : "default" },
          { label: "En attente de départ", value: waiting.length },
        ]}
      />

      {convoys.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucun convoi ne vous est confié pour le moment. Les lots où vous êtes désigné convoyeur apparaîtront ici dès leur autorisation.</p>
      ) : null}

      {onTheRoad.map((convoy) => (
        <section key={convoy.id} className="space-y-3">
          <FieldLotStrip lot={convoy} highlight="destination">
            <a href={convoy.navigationUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants())}><Navigation /> Naviguer vers l&apos;arrivée</a>
          </FieldLotStrip>
          {convoy.plannedRoute ? (
            <p className="flex gap-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-sm"><Route className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> <span>{convoy.plannedRoute}</span></p>
          ) : null}
          <ConvoyTrackingPanel lotId={convoy.id} canTrack />
        </section>
      ))}

      {waiting.length ? (
        <section aria-labelledby="attente" className="space-y-3">
          <div>
            <h2 id="attente" className="text-lg font-semibold">En attente de départ</h2>
            <p className="text-sm text-muted-foreground">Le suivi démarre quand le responsable du site de départ vous remet les cartons.</p>
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
