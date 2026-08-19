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
    surfaceM2: e.surfaceM2,
    longueur: e.longueur,
    largeur: e.largeur,
    hauteurSousPlafond: e.hauteurSousPlafond,
    nombreNiveaux: e.nombreNiveaux,
    nombreSalles: e.nombreSalles,
    nombreZonesArchivage: e.nombreZonesArchivage,
    nombreRayonnages: e.nombreRayonnages,
    nombreTravees: e.nombreTravees,
    nombreEtageres: e.nombreEtageres,
    capaciteCartonsMax: e.capaciteCartonsMax,
    capaciteBoitesMax: e.capaciteBoitesMax,
    capaciteTheorique: e.capaciteTheorique,
    temperatureMoyenne: e.temperatureMoyenne,
    temperatureMin: e.temperatureMin,
    temperatureMax: e.temperatureMax,
    systemeClimatisation: e.systemeClimatisation,
    climatisationFonctionnelle: e.climatisationFonctionnelle,
    humiditeMoyenne: e.humiditeMoyenne,
    humiditeMin: e.humiditeMin,
    humiditeMax: e.humiditeMax,
    deshumidificateur: e.deshumidificateur,
    systemeControleHumidite: e.systemeControleHumidite,
    protectionEau: e.protectionEau,
    protectionInfiltrations: e.protectionInfiltrations,
    etancheiteBatiment: e.etancheiteBatiment,
    protectionPoussiere: e.protectionPoussiere,
    protectionNuisibles: e.protectionNuisibles,
    extincteursDisponibles: e.extincteursDisponibles,
    nombreExtincteurs: e.nombreExtincteurs,
    detecteursFumee: e.detecteursFumee,
    systemeAlarmeIncendie: e.systemeAlarmeIncendie,
    systemeExtinctionAutomatique: e.systemeExtinctionAutomatique,
    dateDernierControleIncendie: e.dateDernierControleIncendie ? e.dateDernierControleIncendie.toISOString().slice(0, 10) : null,
    dateProchainControleIncendie: e.dateProchainControleIncendie ? e.dateProchainControleIncendie.toISOString().slice(0, 10) : null,
    gardiennage: e.gardiennage,
    videosurveillance: e.videosurveillance,
    nombreCameras: e.nombreCameras,
    alarmeAntiIntrusion: e.alarmeAntiIntrusion,
    controleAcces: e.controleAcces,
    badge: e.badge,
    serrureSecurisee: e.serrureSecurisee,
    registreVisiteurs: e.registreVisiteurs,
    typeAcces: e.typeAcces,
    accesLibre: e.accesLibre,
    autorisationNecessaire: e.autorisationNecessaire,
    badgeNecessaire: e.badgeNecessaire,
    controleIdentite: e.controleIdentite,
    horaireOuverture: e.horaireOuverture,
    horaireFermeture: e.horaireFermeture,
    joursAcces: e.joursAcces,
    accesWeekend: e.accesWeekend,
    responsableAcces: e.responsableAcces,
    contactUrgence: e.contactUrgence,
    cartonsOccupes: e.cartonsOccupes,
    capaciteDisponible: e.capaciteDisponible,
    tauxOccupation: e.tauxOccupation,
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
