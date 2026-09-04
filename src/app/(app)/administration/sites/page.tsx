import { Warehouse } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllSites, listAllCommunes } from "@/lib/services/referentiels-admin-service";
import { SitesManager } from "@/components/administration/SitesManager";
import { PageHeader } from "@/components/layout/PageHeader";

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
    latitude: s.latitude,
    longitude: s.longitude,
    altitude: s.altitude,
    precisionGps: s.precisionGps,
    adresseGps: s.adresseGps,
    pointGps: s.pointGps,
    commune: s.commune ? { id: s.commune.id, nom: s.commune.nom } : null,
    _count: s._count,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Infrastructure"
        icon={Warehouse}
        title="Sites"
        description={`${sites.length} site${sites.length > 1 ? "s" : ""} d'archivage proposé${sites.length > 1 ? "s" : ""} en première étape de la Collecte.`}
        stats={[
          { label: "Total", value: sites.length },
          { label: "Actifs", value: sites.filter((s) => s.isActive).length, tone: "success" },
          { label: "Communes", value: communes.filter((c) => c.isActive).length },
        ]}
      />
      <SitesManager sites={serialized} communes={communes.filter((c) => c.isActive).map((c) => ({ id: c.id, nom: c.nom }))} />
    </div>
  );
}
