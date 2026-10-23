import Link from "next/link";
import { ScanLine, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getNumerisationWorkspace } from "@/lib/services/production-queue-service";
import { parseProductionQueueSearch } from "@/lib/validation/production-queue";
import { ScannerWorkstation } from "@/components/numerisation/ScannerWorkstation";
import { NumerisationCartonTable } from "@/components/numerisation/NumerisationCartonTable";
import { DataPagination } from "@/components/shared/DataPagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Numérisation par carton — GeoArchives" };

const FILTERS = [
  { value: "A_TRAITER", label: "À numériser" },
  { value: "A_CONTROLER", label: "À contrôler" },
  { value: "TERMINE", label: "Terminés" },
  { value: "REJETE", label: "Rejetés" },
  { value: "TOUS", label: "Tous" },
] as const;

export default async function NumerisationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("NUMERISATION_VIEW");
  const filters = parseProductionQueueSearch(await searchParams);
  const data = await getNumerisationWorkspace(filters);
  const paginationParams: Record<string, string> = { statut: filters.statut };
  if (filters.q) paginationParams.q = filters.q;

  return (
    <div className="space-y-5">
      <section className="border-b-2 border-activity-numerisation/45 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><Badge variant="secondary" className="rounded-md border-activity-numerisation/25 bg-activity-numerisation/10 text-activity-numerisation uppercase tracking-[0.16em]">Chaîne numérique</Badge><h1 className="mt-3 text-2xl font-semibold">Numérisation par carton</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Tous les cartons préparés arrivent dans cette file. Le poste scanner associe chaque versement au bon dossier et trace l’agent connecté.</p></div>
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-activity-numerisation/10 text-activity-numerisation ring-1 ring-activity-numerisation/25"><ScanLine /></span>
        </div>
      </section>
      <section className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border">
        <Metric label="À numériser" value={data.summary.aNumeriser} />
        <Metric label="À contrôler" value={data.summary.aControler} />
        <Metric label="Numérisés" value={data.summary.termines} />
      </section>

      {filters.carton && data.selectedItems.length > 0 ? (
        <section className="space-y-4 border-y border-border/70 py-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Carton au poste scanner</h2><p className="text-sm text-muted-foreground">{data.selectedItems.length} dossier(s) à traiter sans quitter cette vue.</p></div><Link href="/numerisation" className={buttonVariants({ size: "sm", variant: "outline" })}>Retour aux cartons</Link></div>
          <ScannerWorkstation dossiers={data.selectedItems} />
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">{FILTERS.map((filter) => <Link key={filter.value} href={`/numerisation?statut=${filter.value}${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ""}`} className={buttonVariants({ size: "sm", variant: filters.statut === filter.value ? "default" : "outline" })}>{filter.label}</Link>)}</div>
          <form className="flex max-w-xl gap-2" action="/numerisation" method="get"><input type="hidden" name="statut" value={filters.statut} /><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={filters.q} className="pl-9" placeholder="Carton, dossier ou titulaire" /></div><Button type="submit" variant="outline">Rechercher</Button></form>
        </div>
        <NumerisationCartonTable cartons={data.cartons} />
      </section>
      <DataPagination basePath="/numerisation" page={data.page} totalPages={data.totalPages} searchParams={paginationParams} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-card px-4 py-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
}
