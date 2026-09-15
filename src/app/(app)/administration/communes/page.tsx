import { MapPinned } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { CommunesManager } from "@/components/administration/CommunesManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Communes — Administration" };

export default async function AdminCommunesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const communes = await listAllCommunes();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        icon={MapPinned}
        title="Communes"
        description={`${communes.length} commune${communes.length > 1 ? "s" : ""} — référentiel utilisé par la Collecte et les dashboards.`}
        stats={[
          { label: "Total", value: communes.length },
          { label: "Actives", value: communes.filter((c) => c.isActive).length, tone: "success" },
        ]}
      />
      <CommunesManager communes={communes} />
    </div>
  );
}