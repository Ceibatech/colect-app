import { requirePermission } from "@/lib/auth/current-user";
import { listAllEquipements, listAllEntrepots } from "@/lib/services/referentiels-admin-service";
import { EquipementsManager } from "@/components/administration/EquipementsManager";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Équipements</h1>
        <p className="text-sm text-muted-foreground">
          {equipements.length} équipement{equipements.length > 1 ? "s" : ""} d&apos;entrepôt — inventaire (rayonnages,
          scanners, systèmes de sécurité...), rattaché à un entrepôt.
        </p>
      </div>
      <EquipementsManager
        equipements={serialized}
        entrepots={entrepots.filter((e) => e.isActive).map((e) => ({ id: e.id, nom: e.nom, site: { nom: e.site.nom } }))}
      />
    </div>
  );
}
