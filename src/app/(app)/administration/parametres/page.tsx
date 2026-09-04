import { SlidersHorizontal } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Paramètres — Administration" };

export default async function AdminParametresPage() {
  await requirePermission("SETTINGS_MANAGE");
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        icon={SlidersHorizontal}
        title="Paramètres"
        description="Paramètres applicatifs globaux et futures optimisations de pilotage."
        stats={[
          { label: "Statut", value: "À venir" },
          { label: "Phase", value: "14" },
        ]}
      />
      <ModulePlaceholder
        title="Paramètres"
        phase="Phase 14 (optimisation)"
        description="Paramètres applicatifs globaux (table settings)."
      />
    </div>
  );
}