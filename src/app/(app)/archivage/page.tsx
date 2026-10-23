import { Archive } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getArchivageWorkspace } from "@/lib/services/production-queue-service";
import { parseProductionQueueSearch } from "@/lib/validation/production-queue";
import { FinalStagePage } from "@/components/workflow/FinalStagePage";

export const metadata = { title: "Archivage — GeoArchives" };
export default async function ArchivagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("ARCHIVAGE_VIEW"); const filters = parseProductionQueueSearch(await searchParams); const data = await getArchivageWorkspace(filters);
  return <FinalStagePage title="Archivage final" description="Les cartons indexés arrivent dans cette file. L’archiviste confirme le classement et la conservation définitive de chaque dossier." icon={<Archive />} filters={filters} data={data} basePath="/archivage" stage="archivage" />;
}
