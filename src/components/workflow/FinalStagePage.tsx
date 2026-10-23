import type { ReactNode } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { FinalStageCartonTable } from "@/components/workflow/FinalStageCartonTable";
import { DataPagination } from "@/components/shared/DataPagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { getIndexationWorkspace } from "@/lib/services/production-queue-service";
import type { parseProductionQueueSearch } from "@/lib/validation/production-queue";

export function FinalStagePage({ title, description, icon, filters, data, basePath, stage }: { title: string; description: string; icon: ReactNode; filters: ReturnType<typeof parseProductionQueueSearch>; data: Awaited<ReturnType<typeof getIndexationWorkspace>>; basePath: string; stage: "indexation" | "archivage" }) {
  const tabs = [{ value: "A_TRAITER", label: "À traiter" }, { value: "A_CONTROLER", label: "À contrôler" }, { value: "TERMINE", label: "Terminés" }, { value: "REJETE", label: "Rejetés" }, { value: "TOUS", label: "Tous" }];
  const search: Record<string, string> = { statut: filters.statut };
  if (filters.q) search.q = filters.q;
  return <div className="space-y-5"><section className="border-b border-border/70 pb-5"><div className="flex items-start justify-between gap-4"><div><Badge variant="secondary" className="rounded-md uppercase tracking-[0.16em]">File métier</Badge><h1 className="mt-3 text-2xl font-semibold">{title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div><span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span></div></section><section className="overflow-hidden rounded-lg border bg-card shadow-sm"><div className="space-y-4 p-4"><div className="flex flex-wrap gap-2">{tabs.map((tab) => <Link key={tab.value} href={`${basePath}?statut=${tab.value}`} className={buttonVariants({ size: "sm", variant: filters.statut === tab.value ? "default" : "outline" })}>{tab.label}</Link>)}</div><form className="flex max-w-xl gap-2" action={basePath}><input type="hidden" name="statut" value={filters.statut} /><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input name="q" defaultValue={filters.q} className="pl-9" placeholder="Carton, dossier ou titulaire" /></div><Button type="submit" variant="outline">Rechercher</Button></form></div><FinalStageCartonTable cartons={data.cartons} stage={stage} /></section><DataPagination basePath={basePath} page={data.page} totalPages={data.totalPages} searchParams={search} /></div>;
}
