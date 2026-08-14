import { requirePermission } from "@/lib/auth/current-user";
import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";

export const metadata = { title: "Administration — GeoArchives-MULCV" };

export default async function AdministrationPage() {
  await requirePermission("USER_MANAGE");
  return (
    <ModulePlaceholder
      title="Administration"
      phase="Phases 3-12"
      description="Utilisateurs, rôles, référentiels (communes, lotissements, natures), paramètres, journal d'audit."
    />
  );
}
