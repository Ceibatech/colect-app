import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CartonScanBox } from "@/components/cartons/CartonScanBox";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { cartonQrSvg, cartonScanUrl, getCartonSheet, getPublicOrigin, resolveCartonRef } from "@/lib/services/carton-service";

export const metadata = { title: "Fiche carton — GeoArchives" };

const STAGES = [
  { key: "statutPreparation", label: "Préparation" },
  { key: "statutNumerisation", label: "Numérisation" },
  { key: "statutConditionnement", label: "Reconditionnement" },
  { key: "statutIndexation", label: "Indexation" },
  { key: "statutArchivage", label: "Archivage" },
] as const;

export default async function CartonSheetPage({ params }: { params: Promise<{ ref: string }> }) {
  const session = await requireAnyPermission("DOSSIER_READ", "TRANSFER_VIEW");
  const id = await resolveCartonRef((await params).ref);
  if (!id) notFound();
  const carton = await getCartonSheet(id);
  if (!carton) notFound();
  const qr = await cartonQrSvg(cartonScanUrl(await getPublicOrigin(), carton.reference));
  const total = carton.dossiers.length;
  const canOpenDossiers = session.permissions.includes("DOSSIER_READ");

  return (
    <div className="space-y-5">
      <PageHeader
        tone="dossiers"
        icon={Package}
        eyebrow="Fiche carton"
        title={<span className="font-mono">{carton.reference}</span>}
        description={`${carton.label ? `« ${carton.label} »` : "Carton sans libellé"}${carton.site ? `, ${[carton.site, carton.salle].filter(Boolean).join(" · ")}` : ""}`}
        stats={[{ label: "Dossiers", value: total }]}
        actions={(
          <>
            <Link href="/cartons" className={buttonVariants({ variant: "outline" })}>Tous les cartons</Link>
            <Link href={`/cartons/etiquettes-dossiers?carton=${carton.id}`} className={buttonVariants({ variant: "outline" })}><Printer /> Étiquettes des dossiers</Link>
            <Link href={`/cartons/etiquettes?ids=${carton.id}`} className={buttonVariants()}><Printer /> Imprimer l&apos;étiquette</Link>
          </>
        )}
      />

      <section className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2 rounded-lg border bg-white p-4 text-black">
          <div className="size-40" role="img" aria-label={`QR code du carton ${carton.reference}`} dangerouslySetInnerHTML={{ __html: qr }} />
          <span className="font-mono text-sm font-semibold">{carton.reference}</span>
        </div>
        <div className="space-y-4 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Avancement des dossiers du carton</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-5">
              {STAGES.map((stage) => {
                const done = carton.dossiers.filter((dossier) => dossier[stage.key] === "TERMINE").length;
                return (
                  <li key={stage.key} className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">{stage.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{done}<span className="text-sm font-normal text-muted-foreground">/{total}</span></p>
                  </li>
                );
              })}
            </ul>
          </div>
          {carton.caisse ? (
            <p className="text-sm">
              Dans le conteneur de transport <Link href={`/caisses/${carton.caisse.id}`} className="font-mono font-semibold text-primary underline-offset-4 hover:underline">{carton.caisse.numero}</Link>
              {carton.caisse.transferLot ? <> pour le lot <Link href={`/transferts/${carton.caisse.transferLot.id}`} className="font-mono text-primary underline-offset-4 hover:underline">{carton.caisse.transferLot.reference}</Link></> : null}
              {carton.misEnCaisseAt ? `, chargé le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(carton.misEnCaisseAt)}` : ""}.
            </p>
          ) : null}
          {carton.labelVariants.length ? (
            <p className="text-sm text-muted-foreground">Autres écritures du libellé : {carton.labelVariants.join(" · ")}</p>
          ) : null}
          {carton.transferLotItems.length ? (
            <p className="text-sm">
              Transferts : {carton.transferLotItems.map((item, index) => (
                <span key={item.transferLot.id}>{index ? ", " : ""}<Link href={`/transferts/${item.transferLot.id}`} className="font-mono text-primary underline-offset-4 hover:underline">{item.transferLot.reference}</Link></span>
              ))}
            </p>
          ) : null}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Vérifier un autre carton</h2>
            <CartonScanBox />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[1040px]">
            <TableHeader><TableRow><TableHead className="pl-5">N°</TableHead><TableHead>Cote</TableHead><TableHead>Dossier</TableHead><TableHead>Titulaire</TableHead>{STAGES.map((stage) => <TableHead key={stage.key}>{stage.label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {carton.dossiers.map((dossier) => (
                <TableRow key={dossier.id}>
                  <TableCell className="pl-5 tabular-nums">{dossier.rangCarton ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{dossier.cote ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {canOpenDossiers ? <Link href={`/dossiers/${dossier.id}`} className="text-primary underline-offset-4 hover:underline">{dossier.reference}</Link> : dossier.reference}
                  </TableCell>
                  <TableCell>{[dossier.nom, dossier.prenoms].filter(Boolean).join(" ") || "Non renseigné"}</TableCell>
                  {STAGES.map((stage) => {
                    const status = dossier[stage.key];
                    return <TableCell key={stage.key}><Badge variant={status === "TERMINE" ? "default" : status === "EN_ATTENTE" ? "outline" : "secondary"}>{status === "TERMINE" ? "Terminé" : status === "EN_ATTENTE" ? "À faire" : status === "REJETE" ? "Rejeté" : status === "A_VALIDER" ? "À valider" : "En cours"}</Badge></TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
