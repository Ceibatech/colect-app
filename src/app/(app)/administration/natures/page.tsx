import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Natures de dossier — Administration" };

export default async function AdminNaturesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  return (
    <ModulePlaceholder
      title="Natures de dossier"
      phase="Phase 6+ (référentiels)"
      description="Gestion du référentiel des natures de dossier (titre foncier, attestation villageoise, etc.)."
    />
  );
}
