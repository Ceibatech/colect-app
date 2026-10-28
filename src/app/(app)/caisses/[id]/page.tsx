import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CaisseForm } from "@/components/caisses/CaisseForm";
import { CaisseRangement, RetirerCarton } from "@/components/caisses/CaisseRangement";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { getCaisse, listCeibaSites } from "@/lib/services/caisse-service";

export const metadata = { title: "Caisse — GeoArchives" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" });

export default async function CaissePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAnyPermission("DOSSIER_READ", "CONDITIONNEMENT_VIEW");
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const caisse = await getCaisse(id);
  if (!caisse) notFound();
  const canRanger = session.permissions.includes("CONDITIONNEMENT_UPDATE") && caisse.isActive;
  const canManage = session.permissions.includes("REFERENTIEL_MANAGE");
  const sites = canManage ? await listCeibaSites() : [];
  const total = caisse.cartons.length;
  const dossiers = caisse.cartons.reduce((sum, carton) => sum + carton.dossiers, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        tone="dossiers"
        icon={Archive}
        eyebrow={`Caisse · ${caisse.site.nom}`}
        title={<span className="font-mono">{caisse.numero}</span>}
        description={caisse.description ?? "Cartons rangés dans cette caisse après leur traitement."}
        stats={[
          { label: "Cartons", value: `${total}/${caisse.capacite}` },
          { label: "Dossiers", value: dossiers },
          { label: "Places libres", value: Math.max(0, caisse.capacite - total) },
        ]}
        actions={(
          <>
            <Link href="/caisses" className={buttonVariants({ variant: "outline" })}>Toutes les caisses</Link>
            <Link href={`/caisses/${caisse.id}/inventaire`} className={buttonVariants()}><Printer /> Étiquette et inventaire</Link>
          </>
        )}
      />

      {canRanger ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Ranger des cartons</h2>
            <p className="text-sm text-muted-foreground">Seuls les cartons dont tous les dossiers ont terminé le reconditionnement, enregistrés sur ce site, peuvent entrer. {caisse.capacite - total > 0 ? `Il reste ${caisse.capacite - total} place${caisse.capacite - total > 1 ? "s" : ""}.` : "La caisse est pleine."}</p>
          </div>
          {total < caisse.capacite ? <CaisseRangement caisseId={caisse.id} numero={caisse.numero} /> : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-base font-semibold">Contenu de la caisse</h2>
          <p className="text-sm text-muted-foreground">Dans l&apos;ordre des cotes.</p>
        </div>
        {total === 0 ? <p className="p-4 text-sm text-muted-foreground">La caisse est vide.</p> : (
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader><TableRow><TableHead className="pl-5">N°</TableHead><TableHead>Cote du carton</TableHead><TableHead>Libellé</TableHead><TableHead>Dossiers</TableHead><TableHead>Rangé le</TableHead>{canRanger ? <TableHead className="text-right pr-5">Action</TableHead> : null}</TableRow></TableHeader>
              <TableBody>
                {caisse.cartons.map((carton, index) => (
                  <TableRow key={carton.id}>
                    <TableCell className="pl-5 tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell><Link href={`/cartons/${carton.cote}`} className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline">{carton.cote}</Link></TableCell>
                    <TableCell>{carton.libelle ?? "Sans libellé"}</TableCell>
                    <TableCell className="tabular-nums">{carton.dossiers}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{carton.misEnCaisseAt ? dateFormat.format(carton.misEnCaisseAt) : "—"}</TableCell>
                    {canRanger ? <TableCell className="pr-5 text-right"><RetirerCarton caisseId={caisse.id} cartonId={carton.id} cote={carton.cote} /></TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {caisse.mouvements.length ? (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-base font-semibold">Historique</h2>
          <ul className="space-y-1 text-sm">
            {caisse.mouvements.map((mouvement) => (
              <li key={mouvement.id} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{dateFormat.format(mouvement.createdAt)}</span>
                <span>{mouvement.type === "RANGEMENT" ? "Rangé" : "Retiré"} : <span className="font-mono">{mouvement.carton.cote ?? `carton ${mouvement.carton.id}`}</span></span>
                {mouvement.user ? <span className="text-muted-foreground">par {mouvement.user.name}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-base font-semibold">Numéro et réglages</h2>
            <p className="text-sm text-muted-foreground">Changer le numéro ne modifie ni le contenu ni les cotes des cartons ; réimprimez seulement l&apos;étiquette de la caisse.</p>
          </div>
          <CaisseForm sites={sites} caisse={{ id: caisse.id, numero: caisse.numero, capacite: caisse.capacite, siteId: caisse.siteId, description: caisse.description, isActive: caisse.isActive }} />
        </section>
      ) : null}
    </div>
  );
}
