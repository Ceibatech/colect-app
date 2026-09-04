import { Map } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllLotissements, listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { LotissementsManager } from "@/components/administration/LotissementsManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Lotissements — Administration" };

export default async function AdminLotissementsPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const [lotissements, communes] = await Promise.all([listAllLotissements(), listAllCommunes()]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        icon={Map}
        title="Lotissements"
        description={`${lotissements.length} lotissement${lotissements.length > 1 ? "s" : ""}, chacun rattaché à une commune.`}
        stats={[
          { label: "Total", value: lotissements.length },
          { label: "Communes actives", value: communes.filter((c) => c.isActive).length, tone: "success" },
        ]}
      />
      <LotissementsManager
        lotissements={lotissements}
        communes={communes.filter((c) => c.isActive).map((c) => ({ id: c.id, nom: c.nom }))}
      />
    </div>
  );
}