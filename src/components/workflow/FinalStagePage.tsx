import type { ReactNode } from "react";
import Link from "next/link";
import { FinalStageCartonTable } from "@/components/workflow/FinalStageCartonTable";
import { DataPagination } from "@/components/shared/DataPagination";
import { SmartSearch } from "@/components/shared/SmartSearch";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { getIndexationWorkspace } from "@/lib/services/production-queue-service";
import type { parseProductionQueueSearch } from "@/lib/validation/production-queue";

export function FinalStagePage({ title, description, icon, filters, data, basePath, stage }: { title: string; description: string; icon: ReactNode; filters: ReturnType<typeof parseProductionQueueSearch>; data: Awaited<ReturnType<typeof getIndexationWorkspace>>; basePath: string; stage: "indexation" | "archivage" }) {
  const tabs = [{ value: "A_TRAITER", label: "À traiter" }, { value: "A_CONTROLER", label: "À contrôler" }, { value: "TERMINE", label: "Terminés" }, { value: "REJETE", label: "Rejetés" }, { value: "TOUS", label: "Tous" }];
  const search: Record<string, string> = { statut: filters.statut };
  if (filters.q) search.q = filters.q;
  const tone = stage === "indexation"
    ? { border: "border-activity-indexation/45", badge: "border-activity-indexation/25 bg-activity-indexation/10 text-activity-indexation", icon: "bg-activity-indexation/10 text-activity-indexation ring-activity-indexation/25" }
    : { border: "border-activity-archivage/45", badge: "border-activity-archivage/25 bg-activity-archivage/10 text-activity-archivage", icon: "bg-activity-archivage/10 text-activity-archivage ring-activity-archivage/25" };
  return <div className="space-y-5"><section className={`border-b-2 pb-5 ${tone.border}`}><div className="flex items-start justify-between gap-4"><div><Badge variant="secondary" className={`rounded-md uppercase tracking-[0.16em] ${tone.badge}`}>File métier</Badge><h1 className="mt-3 text-2xl font-semibold">{title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-md ring-1 ${tone.icon}`}>{icon}</span></div></section><section className="overflow-hidden rounded-lg border bg-card shadow-sm"><div className="space-y-4 p-4"><div className="flex flex-wrap gap-2">{tabs.map((tab) => <Link key={tab.value} href={`${basePath}?statut=${tab.value}`} className={buttonVariants({ size: "sm", variant: filters.statut === tab.value ? "default" : "outline" })}>{tab.label}</Link>)}</div><SmartSearch key={filters.q ?? ""} stage={stage} basePath={basePath} statut={filters.statut} defaultValue={filters.q} /></div><FinalStageCartonTable cartons={data.cartons} stage={stage} /></section><DataPagination basePath={basePath} page={data.page} totalPages={data.totalPages} searchParams={search} /></div>;
}
