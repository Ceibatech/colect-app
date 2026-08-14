import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Lotissements — Administration" };

export default async function AdminLotissementsPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  return (
    <ModulePlaceholder
      title="Lotissements"
      phase="Phase 6+ (référentiels)"
      description="Gestion du référentiel des lotissements, rattachés à une commune."
    />
  );
}
