import { requirePermission } from "@/lib/auth/current-user";
import { listAllEntrepots, listAllSites } from "@/lib/services/referentiels-admin-service";
import { EntrepotsManager } from "@/components/administration/EntrepotsManager";

export const metadata = { title: "Entrepôts — Administration" };

export default async function AdminEntrepotsPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const [entrepots, sites] = await Promise.all([listAllEntrepots(), listAllSites()]);

  const serialized = entrepots.map((e) => ({
    id: e.id,
    siteId: e.siteId,
    code: e.code,
    nom: e.nom,
    typeEntrepot: e.typeEntrepot,
    description: e.description,
    isActive: e.isActive,
    anneeMiseEnService: e.anneeMiseEnService,
    responsable: e.responsable,
    telephone: e.telephone,
    email: e.email,
    site: { id: e.site.id, nom: e.site.nom },
    _count: e._count,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Entrepôts</h1>
        <p className="text-sm text-muted-foreground">
          {entrepots.length} entrepôt{entrepots.length > 1 ? "s" : ""}, rattachés à un site — un site peut avoir
          plusieurs entrepôts.
        </p>
      </div>
      <EntrepotsManager entrepots={serialized} sites={sites.filter((s) => s.isActive).map((s) => ({ id: s.id, nom: s.nom }))} />
    </div>
  );
}
