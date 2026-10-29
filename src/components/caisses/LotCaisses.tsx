import Link from "next/link";
import { Container } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

type CaisseDuLot = { id: number; numero: string; capacite: number; cartons: Array<{ id: number; cote: string | null }> };

/**
 * Conteneurs de transport chargés pour ce lot et leurs cartons. Les cartons en
 * attente d'enlèvement ou de retour qui ne sont dans aucun conteneur sont comptés.
 */
export function LotCaisses({ caisses, horsCaisse, canLoad }: { caisses: CaisseDuLot[]; horsCaisse: number; canLoad: boolean }) {
  if (!caisses.length && !horsCaisse) return null;
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><Container className="size-4 text-muted-foreground" /> Conteneurs de transport</h2>
          <p className="text-sm text-muted-foreground">
            {caisses.length ? `${caisses.length} conteneur${caisses.length > 1 ? "s" : ""} chargé${caisses.length > 1 ? "s" : ""} pour ce lot.` : "Aucun conteneur chargé pour ce lot."}
            {horsCaisse ? ` ${horsCaisse} carton${horsCaisse > 1 ? "s" : ""} à transporter ${horsCaisse > 1 ? "ne sont" : "n'est"} dans aucun conteneur.` : ""}
          </p>
        </div>
        {canLoad ? <Link href="/caisses" className={buttonVariants({ size: "sm", variant: "outline" })}>Charger un conteneur</Link> : null}
      </div>
      {caisses.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {caisses.map((caisse) => (
            <li key={caisse.id} className="rounded-md border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/caisses/${caisse.id}`} className="font-mono font-semibold text-primary underline-offset-4 hover:underline">{caisse.numero}</Link>
                <span className="text-sm tabular-nums text-muted-foreground">{caisse.cartons.length}/{caisse.capacite} cartons</span>
              </div>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {caisse.cartons.map((carton) => (
                  <Link key={carton.id} href={`/cartons/${carton.cote ?? `CTN-${String(carton.id).padStart(8, "0")}`}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/70">{carton.cote ?? carton.id}</Link>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
