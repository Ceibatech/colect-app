import Link from "next/link";
import { ClipboardCheck, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getPreparationWorkspace } from "@/lib/services/preparation-service";
import { parsePreparationSearch } from "@/lib/validation/preparation";
import { PreparationQueueTable } from "@/components/preparation/PreparationQueueTable";
import { DataPagination } from "@/components/shared/DataPagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const metadata = { title: "Préparation documentaire — GeoArchives" };

const FILTERS = [
  { value: "A_TRAITER", label: "À préparer" },
  { value: "A_VALIDER", label: "À contrôler" },
  { value: "TERMINE", label: "Terminés" },
  { value: "REJETE", label: "Rejetés" },
  { value: "TOUS", label: "Tous" },
] as const;

export default async function PreparationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("PREPARATION_VIEW");
  const rawParams = await searchParams;
  const filters = parsePreparationSearch(rawParams);
  const data = await getPreparationWorkspace(filters);

  const paginationParams: Record<string, string> = { statut: filters.statut };
  if (filters.q) paginationParams.q = filters.q;
  if (filters.carton) paginationParams.carton = filters.carton;

  return (
    <div className="space-y-5">
      <section className="border-b border-border/70 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="secondary" className="rounded-md uppercase tracking-[0.16em]">
              Atelier documentaire
            </Badge>
            <h1 className="mt-3 text-2xl font-semibold">Préparation des dossiers</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              File partagée des dossiers validés. L’agent préparateur peut traiter un dossier quel que soit l’auteur de l’inventaire initial.
            </p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Charge active</p>
              <p className="text-xl font-semibold tabular-nums">{data.summary.aTraiter}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
        <Metric label="À préparer" value={data.summary.aTraiter} />
        <Metric label="À contrôler" value={data.summary.aValider} />
        <Metric label="Préparés" value={data.summary.termines} />
        <Metric label="Rejetés" value={data.summary.rejetes} alert={data.summary.rejetes > 0} />
      </section>

      <section className="border-y border-border/70 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Travail partagé par carton</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Plusieurs agents peuvent traiter le même carton, chacun sur un dossier réservé distinct.
            </p>
          </div>
          <form className="flex min-w-0 flex-1 flex-wrap items-end justify-end gap-2" action="/preparation" method="get">
            <input type="hidden" name="statut" value={filters.statut} />
            <label className="min-w-56 flex-1 sm:max-w-md">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Carton actif</span>
              <select
                name="carton"
                defaultValue={filters.carton ?? ""}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">Tous les cartons</option>
                {data.cartonChoices.map((carton) => (
                  <option key={carton.key} value={carton.key}>
                    {carton.label}{carton.description ? ` — ${carton.description}` : ""} ({carton.dossierCount} dossier{carton.dossierCount > 1 ? "s" : ""})
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">Ouvrir</Button>
          </form>
        </div>

        {data.selectedCartonSummary ? (
          <div className="mt-4 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Dossiers du carton" value={data.selectedCartonSummary.totalDossiers} />
            <Metric label="Renseignés" value={data.selectedCartonSummary.renseignes} />
            <Metric label="En cours" value={data.selectedCartonSummary.enCours} />
            <Metric label="Restants" value={data.selectedCartonSummary.restants} alert={data.selectedCartonSummary.restants > 0} />
            <Metric label="Pièces déclarées" value={data.selectedCartonSummary.nombrePieces} />
            <Metric label="Pages déclarées" value={data.selectedCartonSummary.nombrePages} />
            <div className="bg-card px-4 py-3 sm:col-span-3 lg:col-span-6">
              <p className="text-xs uppercase text-muted-foreground">Équipe du carton</p>
              <p className="mt-1 text-sm font-medium">
                {data.selectedCartonSummary.agents.join(", ") || "Aucun agent n’a encore pris de dossier en charge."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contrôle d’avancement : {data.selectedCartonSummary.renseignes + data.selectedCartonSummary.enCours + data.selectedCartonSummary.restants}/{data.selectedCartonSummary.totalDossiers} dossiers suivis.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2" aria-label="Filtrer la file de préparation">
            {FILTERS.map((filter) => (
              <Link
                key={filter.value}
                href={`/preparation?statut=${filter.value}${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ""}${filters.carton ? `&carton=${encodeURIComponent(filters.carton)}` : ""}`}
                className={buttonVariants({ size: "sm", variant: filters.statut === filter.value ? "default" : "outline" })}
              >
                {filter.label}
              </Link>
            ))}
          </div>

          <form className="flex max-w-xl gap-2" action="/preparation" method="get">
            <input type="hidden" name="statut" value={filters.statut} />
            {filters.carton ? <input type="hidden" name="carton" value={filters.carton} /> : null}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={filters.q}
                className="pl-9"
                placeholder="Référence, code-barres, carton ou titulaire"
              />
            </div>
            <Button type="submit" variant="outline">Rechercher</Button>
          </form>
        </div>

        <PreparationQueueTable items={data.items} permissions={session.permissions} currentUserId={session.userId} />
      </section>

      <DataPagination
        basePath="/preparation"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={paginationParams}
      />
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", alert && "text-destructive")}>{value}</p>
    </div>
  );
}
