import { Tags } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllNatures } from "@/lib/services/referentiels-admin-service";
import { NaturesManager } from "@/components/administration/NaturesManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Natures de dossier — Administration" };

export default async function AdminNaturesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const natures = await listAllNatures();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        icon={Tags}
        title="Natures de dossier"
        description={`${natures.length} nature${natures.length > 1 ? "s" : ""} de dossier proposée${natures.length > 1 ? "s" : ""} pendant la collecte.`}
        stats={[
          { label: "Total", value: natures.length },
          { label: "Actives", value: natures.filter((n) => n.isActive).length, tone: "success" },
        ]}
      />
      <NaturesManager natures={natures} />
    </div>
  );
}