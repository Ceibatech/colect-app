import { requirePermission } from "@/lib/auth/current-user";
import { listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { CommunesManager } from "@/components/administration/CommunesManager";

export const metadata = { title: "Communes — Administration" };

export default async function AdminCommunesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const communes = await listAllCommunes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Communes</h1>
        <p className="text-sm text-muted-foreground">
          {communes.length} commune{communes.length > 1 ? "s" : ""} — référentiel utilisé par la Collecte (§40) et les
          dashboards (§48).
        </p>
      </div>
      <CommunesManager communes={communes} />
    </div>
  );
}
