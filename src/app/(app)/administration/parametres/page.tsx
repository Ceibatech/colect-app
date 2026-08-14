import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Paramètres — Administration" };

export default async function AdminParametresPage() {
  await requirePermission("SETTINGS_MANAGE");
  return (
    <ModulePlaceholder
      title="Paramètres"
      phase="Phase 14 (optimisation)"
      description="Paramètres applicatifs globaux (table settings)."
    />
  );
}
