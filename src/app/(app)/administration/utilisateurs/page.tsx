import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Utilisateurs — Administration" };

export default async function AdminUtilisateursPage() {
  await requirePermission("USER_MANAGE");
  return (
    <ModulePlaceholder
      title="Utilisateurs"
      phase="Phase 3+ (extension admin)"
      description="Création, modification, activation/désactivation des comptes et attribution des rôles."
    />
  );
}
