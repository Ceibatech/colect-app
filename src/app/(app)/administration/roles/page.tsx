import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Rôles — Administration" };

export default async function AdminRolesPage() {
  await requirePermission("ROLE_MANAGE");
  return (
    <ModulePlaceholder
      title="Rôles & permissions"
      phase="Phase 3+ (extension admin)"
      description="Gestion des rôles et de leurs permissions associées (role_permissions)."
    />
  );
}
