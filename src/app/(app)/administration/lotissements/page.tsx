import { requirePermission } from "@/lib/auth/current-user";
import { listAllLotissements, listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { LotissementsManager } from "@/components/administration/LotissementsManager";

export const metadata = { title: "Lotissements — Administration" };

export default async function AdminLotissementsPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const [lotissements, communes] = await Promise.all([listAllLotissements(), listAllCommunes()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Lotissements</h1>
        <p className="text-sm text-muted-foreground">
          {lotissements.length} lotissement{lotissements.length > 1 ? "s" : ""}, rattachés à une commune (§40).
        </p>
      </div>
      <LotissementsManager
        lotissements={lotissements}
        communes={communes.filter((c) => c.isActive).map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </div>
  );
}
