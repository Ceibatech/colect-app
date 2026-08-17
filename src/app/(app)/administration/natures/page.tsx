import { requirePermission } from "@/lib/auth/current-user";
import { listAllNatures } from "@/lib/services/referentiels-admin-service";
import { NaturesManager } from "@/components/administration/NaturesManager";

export const metadata = { title: "Natures de dossier — Administration" };

export default async function AdminNaturesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const natures = await listAllNatures();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Natures de dossier</h1>
        <p className="text-sm text-muted-foreground">
          {natures.length} nature{natures.length > 1 ? "s" : ""} de dossier (titre foncier, attestation villageoise...).
        </p>
      </div>
      <NaturesManager natures={natures} />
    </div>
  );
}
