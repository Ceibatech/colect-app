import Link from "next/link";
import { Archive } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CaisseForm } from "@/components/caisses/CaisseForm";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { listCaisses, listCeibaSites } from "@/lib/services/caisse-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Caisses de transport — GeoArchives" };

/** Caisses de transport (enlèvement et retour) : lesquelles sont chargées, pour quel lot, avec quels cartons. */
export default async function CaissesPage() {
  const session = await requireAnyPermission("TRANSFER_VIEW", "DOSSIER_READ");
  const canManage = session.permissions.includes("REFERENTIEL_MANAGE");
  const [caisses, sites] = await Promise.all([listCaisses(), canManage ? listCeibaSites() : Promise.resolve([])]);
  const actives = caisses.filter((caisse) => caisse.isActive);

  return (
    <div className="space-y-5">
      <PageHeader
        tone="transfer"
        icon={Archive}
        eyebrow="Transferts d'archives"
        title="Caisses de transport"
        description="À l'enlèvement chez le client et au retour, les cartons du lot sont chargés caisse par caisse (40 au plus). L'application sait à tout moment quel carton voyage dans quelle caisse ; la caisse se vide à la réception."
        stats={[
          { label: "Caisses en service", value: actives.length },
          { label: "Chargées", value: actives.filter((caisse) => caisse.cartons > 0).length },
          { label: "Cartons en caisse", value: actives.reduce((sum, caisse) => sum + caisse.cartons, 0) },
        ]}
      />

      {caisses.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Aucune caisse pour le moment. Créez-les dès que leur numérotation est fixée ; un numéro peut être corrigé plus tard sans toucher au contenu.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {caisses.map((caisse) => {
            const ratio = Math.min(1, caisse.cartons / caisse.capacite);
            const full = caisse.cartons >= caisse.capacite;
            return (
              <li key={caisse.id}>
                <Link href={`/caisses/${caisse.id}`} className={cn("block space-y-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60", !caisse.isActive && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-lg font-semibold">{caisse.numero}</p>
                    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", !caisse.isActive ? "bg-muted text-muted-foreground" : full ? "bg-amber-100 text-amber-900" : caisse.cartons ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {!caisse.isActive ? "Hors service" : full ? "Pleine" : caisse.cartons ? "Chargée" : "Disponible"}
                    </span>
                  </div>
                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={caisse.capacite} aria-valuenow={caisse.cartons} aria-label={`Remplissage de la caisse ${caisse.numero}`}>
                      <div className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-primary")} style={{ width: `${ratio * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-sm tabular-nums"><span className="font-semibold">{caisse.cartons}</span>/{caisse.capacite} cartons · {caisse.dossiers} dossiers</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{caisse.transferLot ? `Lot ${caisse.transferLot.reference} · ` : ""}Basée à {caisse.site.nom}{caisse.description ? ` · ${caisse.description}` : ""}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canManage ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Ajouter une caisse</h2>
            <p className="text-sm text-muted-foreground">Saisissez le numéro tel qu&apos;il est écrit sur la caisse, et son site CEIBA de rattachement. Il ne fait pas partie des cotes des cartons.</p>
          </div>
          {sites.length ? <CaisseForm sites={sites} /> : <p className="text-sm text-muted-foreground">Aucun site CEIBA actif : créez d&apos;abord le site dans Administration → Sites.</p>}
        </section>
      ) : null}
    </div>
  );
}
