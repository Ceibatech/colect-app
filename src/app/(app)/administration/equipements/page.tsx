import { Wrench } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllEquipements, listAllEntrepots } from "@/lib/services/referentiels-admin-service";
import { EquipementsManager } from "@/components/administration/EquipementsManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Équipements — Administration" };

export default async function AdminEquipementsPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const [equipements, entrepots] = await Promise.all([listAllEquipements(), listAllEntrepots()]);

  const serialized = equipements.map((e) => ({
    id: e.id,
    entrepotId: e.entrepotId,
    type: e.type,
    reference: e.reference,
    marque: e.marque,
    quantite: e.quantite,
    etat: e.etat,
    dateAcquisition: e.dateAcquisition ? e.dateAcquisition.toISOString().slice(0, 10) : null,
    dateDernierControle: e.dateDernierControle ? e.dateDernierControle.toISOString().slice(0, 10) : null,
    dateProchaineMaintenance: e.dateProchaineMaintenance ? e.dateProchaineMaintenance.toISOString().slice(0, 10) : null,
    observation: e.observation,
    entrepot: { id: e.entrepot.id, nom: e.entrepot.nom, site: { id: e.entrepot.site.id, nom: e.entrepot.site.nom } },
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Infrastructure"
        icon={Wrench}
        title="Équipements"
        description={`${equipements.length} équipement${equipements.length > 1 ? "s" : ""} d'entrepôt rattaché${equipements.length > 1 ? "s" : ""} aux espaces d'archivage.`}
        stats={[
          { label: "Total", value: equipements.length },
          { label: "Entrepôts actifs", value: entrepots.filter((e) => e.isActive).length, tone: "success" },
          { label: "Maintenance", value: "Suivi" },
        ]}
      />
      <EquipementsManager
        equipements={serialized}
        entrepots={entrepots.filter((e) => e.isActive).map((e) => ({ id: e.id, nom: e.nom, site: { nom: e.site.nom } }))}
      />
    </div>
  );
}
