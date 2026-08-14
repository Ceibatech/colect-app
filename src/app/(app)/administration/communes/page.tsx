import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Communes — Administration" };

export default async function AdminCommunesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  return (
    <ModulePlaceholder
      title="Communes"
      phase="Phase 6+ (référentiels)"
      description="Gestion du référentiel des communes utilisé par la collecte et les dashboards."
    />
  );
}
