import Link from "next/link";
import { Boxes, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CartonScanBox } from "@/components/cartons/CartonScanBox";
import { DataPagination } from "@/components/shared/DataPagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAnyPermission } from "@/lib/auth/current-user";
import { LABEL_PRINT_LIMIT, listCartonLocations, listCartons } from "@/lib/services/carton-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cartons et QR codes — GeoArchives" };

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

export default async function CartonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAnyPermission("DOSSIER_READ", "TRANSFER_VIEW");
  const params = await searchParams;
  const q = single(params.q)?.trim().slice(0, 200) || undefined;
  const siteId = positiveInt(single(params.site));
  const entrepotId = positiveInt(single(params.salle));
  const page = positiveInt(single(params.page)) ?? 1;
  const [data, locations] = await Promise.all([listCartons({ q, siteId, entrepotId, page }), listCartonLocations()]);
  const query: Record<string, string> = {};
  if (q) query.q = q;
  if (siteId) query.site = String(siteId);
  if (entrepotId) query.salle = String(entrepotId);
  const printHref = `/cartons/etiquettes?${new URLSearchParams(query)}`;
  const salles = locations.entrepots.filter((entrepot) => !siteId || entrepot.siteId === siteId);

  return (
    <div className="space-y-5">
      <PageHeader
        tone="dossiers"
        icon={Boxes}
        eyebrow="Identification physique"
        title="Cartons et QR codes"
        description="Chaque carton porte sa cote du référentiel MULCV (2010-KOU-0001 : rubrique, commune, n°). Imprimez son étiquette QR et collez-la sur le carton : un scan ouvre sa fiche."
        stats={[{ label: "Cartons", value: data.total }]}
        actions={<Link href={printHref} className={buttonVariants()}><Printer /> Imprimer les étiquettes{data.total > LABEL_PRINT_LIMIT ? ` (${LABEL_PRINT_LIMIT} premières)` : ""}</Link>}
      />

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <CartonScanBox defaultValue={q ?? ""} />
        <form action="/cartons" method="get" className="flex flex-wrap items-end gap-3">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Site</span>
            <select name="site" defaultValue={siteId ?? ""} className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Tous les sites</option>
              {locations.sites.map((site) => <option key={site.id} value={site.id}>{site.nom}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Salle</span>
            <select name="salle" defaultValue={entrepotId ?? ""} className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Toutes les salles</option>
              {salles.map((salle) => <option key={salle.id} value={salle.id}>{salle.nom}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline">Filtrer</Button>
          {q || siteId || entrepotId ? <Link href="/cartons" className={buttonVariants({ variant: "ghost" })}>Effacer</Link> : null}
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        {data.rows.length === 0 ? (
          <p className="px-6 py-14 text-center text-sm text-muted-foreground">Aucun carton ne correspond. Vérifiez le libellé ou scannez le QR code du carton.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader><TableRow><TableHead className="pl-5">Carton</TableHead><TableHead>Libellé</TableHead><TableHead>Site · salle</TableHead><TableHead>Dossiers</TableHead><TableHead className="text-right">Étiquette</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-5"><Link href={`/cartons/${row.reference}`} className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline">{row.reference}</Link></TableCell>
                    <TableCell className="max-w-80">{row.label ?? <span className="text-destructive">Sans libellé</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{[row.site, row.salle].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="tabular-nums">{row.dossiers}</TableCell>
                    <TableCell className="text-right"><Link href={`/cartons/etiquettes?ids=${row.id}`} className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><Printer /> Imprimer</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <DataPagination basePath="/cartons" page={data.page} totalPages={data.totalPages} searchParams={query} />
    </div>
  );
}
