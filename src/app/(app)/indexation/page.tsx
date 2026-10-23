import { ScanSearch } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getIndexationWorkspace } from "@/lib/services/production-queue-service";
import { parseProductionQueueSearch } from "@/lib/validation/production-queue";
import { FinalStagePage } from "@/components/workflow/FinalStagePage";

export const metadata = { title: "Indexation — GeoArchives" };
export default async function IndexationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("INDEXATION_VIEW"); const filters = parseProductionQueueSearch(await searchParams); const data = await getIndexationWorkspace(filters);
  return <FinalStagePage title="Indexation documentaire" description="Les cartons reconditionnés arrivent ici. L’automatisation traite les fichiers; l’agent intervient uniquement sur les éléments à qualifier." icon={<ScanSearch />} filters={filters} data={data} basePath="/indexation" stage="indexation" />;
}
