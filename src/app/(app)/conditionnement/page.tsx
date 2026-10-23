import Link from "next/link";
import { PackageCheck, Search } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getConditionnementWorkspace } from "@/lib/services/production-queue-service";
import { parseProductionQueueSearch } from "@/lib/validation/production-queue";
import { ConditionnementCartonQueue } from "@/components/conditionnement/ConditionnementCartonQueue";
import { DataPagination } from "@/components/shared/DataPagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "Reconditionnement — GeoArchives" };
const FILTERS = [{ value: "A_TRAITER", label: "À conditionner" }, { value: "TERMINE", label: "Terminés" }, { value: "REJETE", label: "Rejetés" }, { value: "TOUS", label: "Tous" }] as const;

export default async function ConditionnementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("CONDITIONNEMENT_VIEW");
  const filters = parseProductionQueueSearch(await searchParams);
  const data = await getConditionnementWorkspace(filters);
  const paginationParams: Record<string, string> = { statut: filters.statut };
  if (filters.q) paginationParams.q = filters.q;
  return <div className="space-y-5">
    <section className="border-b border-border/70 pb-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><Badge variant="secondary" className="rounded-md uppercase tracking-[0.16em]">Chaîne physique</Badge><h1 className="mt-3 text-2xl font-semibold">Reconditionnement des cartons</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Les cartons numérisés arrivent automatiquement ici. L’agent remet les dossiers en ordre, referme le carton et transmet la suite à l’indexation.</p></div><span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"><PackageCheck /></span></div></section>
    <section className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border"><Metric label="À conditionner" value={data.summary.aConditionner} /><Metric label="En cours" value={data.summary.enCours} /><Metric label="Terminés" value={data.summary.termines} /></section>
    {filters.carton && data.selectedItems.length > 0 ? <section className="overflow-hidden rounded-lg border bg-card"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Dossiers du carton</h2><p className="text-sm text-muted-foreground">Traçabilité de chaque dossier reconditionné.</p></div><Link href="/conditionnement" className={buttonVariants({ size: "sm", variant: "outline" })}>Retour aux cartons</Link></div><Table><TableHeader><TableRow><TableHead>Dossier</TableHead><TableHead>Titulaire</TableHead><TableHead>Statut</TableHead><TableHead>Agent</TableHead><TableHead>Date</TableHead></TableRow></TableHeader><TableBody>{data.selectedItems.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs font-semibold text-primary">{item.reference}</TableCell><TableCell>{[item.nom, item.prenoms].filter(Boolean).join(" ") || "Non renseigné"}</TableCell><TableCell><Badge variant={item.statutConditionnement === "TERMINE" ? "default" : "secondary"}>{item.statutConditionnement === "TERMINE" ? "Terminé" : item.statutConditionnement === "EN_COURS" ? "En cours" : "À faire"}</Badge></TableCell><TableCell>{item.conditionneur?.name ?? "Non attribué"}</TableCell><TableCell>{item.dateConditionnement ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(item.dateConditionnement) : "—"}</TableCell></TableRow>)}</TableBody></Table></section> : null}
    <section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm"><div className="space-y-4 p-4"><div className="flex flex-wrap gap-2">{FILTERS.map((filter) => <Link key={filter.value} href={`/conditionnement?statut=${filter.value}${filters.q ? `&q=${encodeURIComponent(filters.q)}` : ""}`} className={buttonVariants({ size: "sm", variant: filters.statut === filter.value ? "default" : "outline" })}>{filter.label}</Link>)}</div><form className="flex max-w-xl gap-2" action="/conditionnement" method="get"><input type="hidden" name="statut" value={filters.statut} /><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={filters.q} className="pl-9" placeholder="Carton, dossier ou titulaire" /></div><Button type="submit" variant="outline">Rechercher</Button></form></div><ConditionnementCartonQueue cartons={data.cartons} canUpdate={session.permissions.includes("CONDITIONNEMENT_UPDATE")} currentUserId={session.userId} /></section>
    <DataPagination basePath="/conditionnement" page={data.page} totalPages={data.totalPages} searchParams={paginationParams} />
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-card px-4 py-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>; }
