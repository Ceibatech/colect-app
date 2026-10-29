import "server-only";
import type { Prisma, TransferItemStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { formatCartonReference } from "@/lib/cartons/reference";
import { SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";
import { isValidGeoPoint } from "@/lib/transfers/route-suggestion";
import { convoyState } from "@/lib/transfers/convoy";

/**
 * Données « terrain » des transferts : l'espace du responsable de site
 * (départs à remettre, arrivées attendues, bordereaux d'arrivée) et l'espace
 * du convoyeur (convois à accompagner). Les contrôles d'autorisation restent
 * ceux des actions : ces vues ne font que présenter le bon travail à la bonne
 * personne.
 */

const ACTIVE_LOT_STATUSES = ["AUTORISE", "PARTIELLEMENT_SORTI", "EN_TRANSIT", "RECU_PARTIEL", "CHEZ_CEIBAC", "RETOUR_PARTIEL"] as const;

function placeLabel(site: { nom: string }, entrepot: { nom: string; localisation: string | null } | null) {
  // La localisation d'un entrepôt reprend souvent le nom du site : ne pas le répéter.
  const parts = [site.nom, entrepot?.nom, entrepot?.localisation].filter((part): part is string => !!part?.trim());
  return parts.filter((part, index) => !parts.slice(0, index).some((previous) => previous.includes(part) || part.includes(previous))).join(" · ");
}

const lotInclude = {
  sourceSite: { select: { id: true, nom: true, organisation: true } },
  sourceEntrepot: { select: { nom: true, localisation: true } },
  destinationSite: { select: { id: true, nom: true, organisation: true, latitude: true, longitude: true, adresse: true, ville: true } },
  destinationEntrepot: { select: { nom: true, localisation: true } },
  participants: { where: { roleCode: "CONVOYEUR" }, select: { user: { select: { name: true } } } },
  convoyEvents: { orderBy: { occurredAt: "asc" as const }, select: { type: true, occurredAt: true, automatic: true, details: true } },
  items: {
    orderBy: { cartonCode: "asc" as const },
    select: {
      id: true, status: true, cartonId: true, cartonCode: true, cartonLabel: true, dossierCountSnapshot: true, carton: { select: { cote: true } },
      movementItems: { where: { movement: { status: { in: ["SOUMIS_CEIBAC" as const, "VALIDE_CEIBAC" as const] } } }, select: { id: true } },
    },
  },
};

type LotWithItems = Awaited<ReturnType<typeof loadLots>>[number];

function loadLots(where: Prisma.TransferLotWhereInput) {
  return prisma.transferLot.findMany({ where, orderBy: [{ plannedAt: "asc" }, { id: "asc" }], include: lotInclude });
}

/** Cartons disponibles pour un mouvement : au bon statut, sans bordereau en attente. */
function movementOptions(lot: LotWithItems, status: TransferItemStatus) {
  return lot.items
    .filter((item) => item.status === status && item.movementItems.length === 0)
    .map((item) => ({
      id: item.id,
      cartonCode: item.carton?.cote ?? (item.cartonId == null ? item.cartonCode : formatCartonReference(item.cartonId)),
      cartonLabel: item.cartonLabel,
      dossierCount: item.dossierCountSnapshot,
    }));
}

function summarize(lot: LotWithItems) {
  const count = (status: TransferItemStatus) => lot.items.filter((item) => item.status === status).reduce((sum, item) => sum + item.dossierCountSnapshot, 0);
  return {
    id: lot.id,
    reference: lot.reference,
    status: lot.status,
    plannedAt: lot.plannedAt,
    plannedRoute: lot.plannedRoute,
    source: placeLabel(lot.sourceSite, lot.sourceEntrepot),
    destination: placeLabel(lot.destinationSite, lot.destinationEntrepot),
    cartons: lot.items.length,
    dossiers: lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0),
    inTransit: count("SORTI"),
    received: count("RECU"),
    escorts: lot.participants.map((participant) => participant.user.name),
    convoy: convoyState(lot.convoyEvents),
  };
}

export async function getSiteWorkspace() {
  const session = await requirePermission("TRANSFER_OPERATE");
  const restricted = session.roleCode === SITE_RESPONSIBLE_ROLE_CODE;
  const sites = restricted
    ? (await prisma.userSite.findMany({ where: { userId: session.userId }, select: { site: { select: { id: true, nom: true, organisation: true } } } })).map((row) => row.site)
    : await prisma.site.findMany({ where: { isActive: true }, orderBy: { nom: "asc" }, select: { id: true, nom: true, organisation: true } });
  const siteIds = sites.map((site) => site.id);
  if (siteIds.length === 0) return { sites, departures: [], loadings: [], arrivals: [], bordereaux: [] };

  const [outgoing, loading, incoming, bordereaux] = await Promise.all([
    loadLots({ sourceSiteId: { in: siteIds }, status: { in: [...ACTIVE_LOT_STATUSES] }, items: { some: { status: "PREVU" } } }),
    // État des lieux de sortie fait : chargement, puis départ du véhicule.
    loadLots({ sourceSiteId: { in: siteIds }, status: { in: [...ACTIVE_LOT_STATUSES] }, movements: { some: { type: "SORTIE", status: { not: "REJETE" } } }, items: { some: { status: { in: ["PREVU", "SORTI"] } } } }),
    loadLots({ destinationSiteId: { in: siteIds }, status: { in: [...ACTIVE_LOT_STATUSES] }, items: { some: { status: "SORTI" } } }),
    // Le site de départ suit aussi l'arrivée de ses cartons.
    prisma.transferMovement.findMany({
      where: { type: "RECEPTION", OR: [{ toSiteId: { in: siteIds } }, { fromSiteId: { in: siteIds } }] },
      orderBy: { occurredAt: "desc" },
      take: 30,
      select: {
        id: true, reference: true, status: true, occurredAt: true, conditionStatus: true, sealStatus: true, incidentReported: true,
        fromSiteId: true, toSiteId: true,
        fromSite: { select: { nom: true } }, toSite: { select: { nom: true } },
        transferLot: { select: { id: true, reference: true } },
        items: { select: { transferLotItem: { select: { dossierCountSnapshot: true } } } },
      },
    }),
  ]);

  return {
    sites,
    departures: outgoing.map((lot) => ({ ...summarize(lot), items: movementOptions(lot, "PREVU") })).filter((lot) => lot.items.length > 0),
    // Lots encore sur le site : le véhicule n'a pas été vu en route.
    loadings: loading.map(summarize).filter((lot) => !lot.convoy.movingAt && !lot.convoy.arrived),
    arrivals: incoming.map((lot) => ({ ...summarize(lot), items: movementOptions(lot, "SORTI") })),
    bordereaux: bordereaux.map((movement) => ({
      id: movement.id,
      reference: movement.reference,
      status: movement.status,
      occurredAt: movement.occurredAt,
      conditionStatus: movement.conditionStatus,
      sealStatus: movement.sealStatus,
      incidentReported: movement.incidentReported,
      lot: movement.transferLot,
      from: movement.fromSite.nom,
      to: movement.toSite.nom,
      side: siteIds.includes(movement.toSiteId) ? "ARRIVEE" as const : "DEPART" as const,
      cartons: movement.items.length,
      dossiers: movement.items.reduce((sum, entry) => sum + entry.transferLotItem.dossierCountSnapshot, 0),
    })),
  };
}

/** Lien de navigation Google Maps depuis la position du téléphone vers la destination. */
function navigationUrl(site: LotWithItems["destinationSite"]) {
  const point = { latitude: site.latitude ?? Number.NaN, longitude: site.longitude ?? Number.NaN };
  const destination = isValidGeoPoint(point)
    ? `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`
    : [site.adresse, site.ville, site.nom, "Côte d'Ivoire"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination, travelmode: "driving" })}`;
}

export async function getConvoyWorkspace() {
  const session = await requirePermission("TRANSFER_TRACK");
  const onlyAssigned = session.roleCode === "CONVOYEUR";
  const lots = await loadLots({
    status: { in: [...ACTIVE_LOT_STATUSES] },
    items: { some: { status: { in: ["PREVU", "SORTI"] } } },
    ...(onlyAssigned ? { participants: { some: { userId: session.userId } } } : {}),
  });
  // Pré-remplissage de la fiche de départ : véhicule et chauffeur du dernier bordereau de sortie.
  const sorties = lots.length
    ? await prisma.transferMovement.findMany({
        where: { transferLotId: { in: lots.map((lot) => lot.id) }, type: "SORTIE" },
        orderBy: { occurredAt: "desc" },
        select: { transferLotId: true, vehicleRegistration: true, vehicleDescription: true, driverName: true, driverPhone: true, sealReferences: true, vehiclePhoto: true },
      })
    : [];
  return lots.map((lot) => {
    const sortie = sorties.find((movement) => movement.transferLotId === lot.id);
    return {
      ...summarize(lot),
      waiting: lot.items.filter((item) => item.status === "PREVU").length,
      navigationUrl: navigationUrl(lot.destinationSite),
      wazeUrl: wazeUrl(lot.destinationSite),
      loadedCartons: lot.items
        .filter((item) => item.status === "SORTI")
        .map((item) => ({
          id: item.id,
          cartonId: item.cartonId,
          code: item.carton?.cote ?? (item.cartonId == null ? item.cartonCode : formatCartonReference(item.cartonId)),
          ctn: item.cartonId == null ? null : formatCartonReference(item.cartonId),
          label: item.cartonLabel,
          dossiers: item.dossierCountSnapshot,
        })),
      prefill: {
        vehicleRegistration: sortie?.vehicleRegistration ?? "",
        driverName: sortie?.driverName ?? "",
        driverPhone: sortie?.driverPhone ?? "",
        sealReferences: sortie?.sealReferences ?? "",
        vehiclePhoto: !!sortie?.vehiclePhoto,
      },
    };
  });
}

/** Navigation Waze (voix et embouteillages gratuits) vers le site d'arrivée. */
function wazeUrl(site: LotWithItems["destinationSite"]) {
  const point = { latitude: site.latitude ?? Number.NaN, longitude: site.longitude ?? Number.NaN };
  if (isValidGeoPoint(point)) return `https://waze.com/ul?ll=${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent([site.adresse, site.ville, site.nom].filter(Boolean).join(", "))}&navigate=yes`;
}
