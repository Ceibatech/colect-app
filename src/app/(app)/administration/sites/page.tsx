import { requirePermission } from "@/lib/auth/current-user";
import { listAllSites, listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { SitesManager } from "@/components/administration/SitesManager";

export const metadata = { title: "Sites — Administration" };

export default async function AdminSitesPage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const [sites, communes] = await Promise.all([listAllSites(), listAllCommunes()]);

  const serialized = sites.map((s) => ({
    id: s.id,
    code: s.code,
    nom: s.nom,
    typeSite: s.typeSite,
    description: s.description,
    isActive: s.isActive,
    dateMiseEnService: s.dateMiseEnService ? s.dateMiseEnService.toISOString().slice(0, 10) : null,
    responsable: s.responsable,
    telephone: s.telephone,
    email: s.email,
    adresse: s.adresse,
    communeId: s.communeId,
    quartier: s.quartier,
    ville: s.ville,
    region: s.region,
    commune: s.commune ? { id: s.commune.id, nom: s.commune.nom } : null,
    _count: s._count,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Sites</h1>
        <p className="text-sm text-muted-foreground">
          {sites.length} site{sites.length > 1 ? "s" : ""} d&apos;archivage. Proposés en première étape de la
          Collecte — au moins un site actif est nécessaire pour pouvoir en choisir un.
        </p>
      </div>
      <SitesManager sites={serialized} communes={communes.filter((c) => c.isActive).map((c) => ({ id: c.id, nom: c.nom }))} />
    </div>
  );
}
