import "server-only";
import { prisma } from "@/lib/prisma/client";
import { ApiError } from "@/lib/utils/api-error";
import { SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";
import { notifyTransferWorkflow } from "@/lib/services/transfer-notification-service";
import { convoyState, distanceMeters, isAtDestination, type GeoPoint } from "@/lib/transfers/convoy";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Départ et arrivée des convois. Le convoyeur appuie sur « Démarrer le
 * trajet » : le départ est enregistré et les deux sites sont prévenus. À
 * l'arrivée (bouton, ou position à moins de 150 m du site d'arrivée), le
 * responsable du site de départ et celui du site qui reçoit sont notifiés que
 * le véhicule est là.
 */

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

export function siteGeoPoint(site: { latitude: number | null; longitude: number | null }): GeoPoint | null {
  return site.latitude != null && site.longitude != null && Number.isFinite(site.latitude) && Number.isFinite(site.longitude)
    ? { latitude: site.latitude, longitude: site.longitude }
    : null;
}

async function loadLot(lotId: number) {
  return prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      id: true,
      reference: true,
      createdById: true,
      sourceSiteId: true,
      destinationSiteId: true,
      sourceSite: { select: { nom: true } },
      destinationSite: { select: { nom: true, latitude: true, longitude: true } },
      items: { where: { status: "SORTI" }, select: { dossierCountSnapshot: true } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true } },
    },
  });
}

/** Le convoyeur ne déclare que les convois où il est désigné. */
export async function assertConvoyActor(session: SessionPayload, lotId: number) {
  if (session.roleCode !== "CONVOYEUR") return;
  const assigned = await prisma.transferLotParticipant.findFirst({ where: { transferLotId: lotId, userId: session.userId }, select: { id: true } });
  if (!assigned) throw new ApiError("Vous n'êtes pas désigné comme convoyeur de ce lot.", 403);
}

async function recipients(lot: { createdById: number; sourceSiteId: number; destinationSiteId: number }, lotId: number) {
  const [responsibles, participants] = await Promise.all([
    prisma.userSite.findMany({
      where: { siteId: { in: [lot.sourceSiteId, lot.destinationSiteId] }, user: { isActive: true, role: { code: SITE_RESPONSIBLE_ROLE_CODE } } },
      select: { userId: true },
    }),
    prisma.transferLotParticipant.findMany({ where: { transferLotId: lotId, roleCode: "GESTIONNAIRE_TRANSFERT" }, select: { userId: true } }),
  ]);
  return [...new Set([lot.createdById, ...responsibles.map((row) => row.userId), ...participants.map((row) => row.userId)])];
}

async function notify(eventId: number, type: "DEPART" | "ARRIVEE", lot: NonNullable<Awaited<ReturnType<typeof loadLot>>>, at: Date, by: string, automatic: boolean) {
  const cartons = lot.items.length;
  const dossiers = lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0);
  const route = `${lot.sourceSite.nom} → ${lot.destinationSite.nom}`;
  try {
    await notifyTransferWorkflow({
      event: type === "DEPART" ? "CONVOY_DEPARTED" : "CONVOY_ARRIVED",
      entityType: "TRANSFER_CONVOY",
      entityId: eventId,
      recipientRoleCodes: [],
      recipientUserIds: await recipients(lot, lot.id),
      title: type === "DEPART" ? `Convoi ${lot.reference} en route` : `Convoi ${lot.reference} arrivé à ${lot.destinationSite.nom}`,
      message: type === "DEPART"
        ? `Le convoi a quitté ${lot.sourceSite.nom} et se dirige vers ${lot.destinationSite.nom}. Son trajet est suivi en direct.`
        : `Le véhicule est arrivé à ${lot.destinationSite.nom}${automatic ? " (position détectée automatiquement)" : ""}. Le responsable du site d'arrivée peut contrôler les cartons et signer l'état des lieux (F03).`,
      reference: lot.reference,
      statusLabel: type === "DEPART" ? "Convoi en route" : "Véhicule arrivé",
      actionPath: type === "DEPART" ? `/transferts/${lot.id}` : "/transferts/mon-site",
      actionLabel: type === "DEPART" ? "Suivre le trajet" : "Faire l'état des lieux",
      details: [
        { label: "Trajet", value: route },
        { label: type === "DEPART" ? "Départ" : "Arrivée", value: timeFormatter.format(at) },
        { label: "Convoyeur", value: by },
        { label: "Chargement", value: `${cartons} carton${cartons > 1 ? "s" : ""}, ${dossiers} dossier${dossiers > 1 ? "s" : ""}` },
      ],
    });
  } catch (error) {
    // Le jalon est enregistré ; une panne de messagerie ne doit pas le masquer.
    console.error("Convoy notification failed.", { eventId, type, error });
  }
}

export async function recordConvoyEvent(session: SessionPayload, lotId: number, type: "DEPART" | "ARRIVEE", position?: GeoPoint | null, automatic = false) {
  const lot = await loadLot(lotId);
  if (!lot) throw new ApiError("Lot introuvable.", 404);
  if (lot.items.length === 0) throw new ApiError("Aucun carton n'est en transit sur ce lot : la remise au départ (F02) doit d'abord être contre-signée.", 409);
  const state = convoyState(lot.convoyEvents);
  if (type === "DEPART" && state.onTheRoad) return { created: false, state };
  if (type === "ARRIVEE" && state.arrived) return { created: false, state };

  const event = await prisma.$transaction(async (tx) => {
    // Sérialise les déclarations simultanées (bouton et détection automatique).
    await tx.$queryRaw`SELECT id FROM transfer_lots WHERE id = ${lotId} FOR UPDATE`;
    const last = await tx.transferConvoyEvent.findFirst({ where: { transferLotId: lotId }, orderBy: { occurredAt: "desc" }, select: { type: true } });
    if (last?.type === type) return null;
    return tx.transferConvoyEvent.create({
      data: { transferLotId: lotId, type, userId: session.userId, latitude: position?.latitude, longitude: position?.longitude, automatic },
      select: { id: true, occurredAt: true },
    });
  });
  if (!event) return { created: false, state };
  await notify(event.id, type, lot, event.occurredAt, session.name, automatic);
  return { created: true, state: convoyState([...lot.convoyEvents, { type, occurredAt: event.occurredAt, automatic }]) };
}

/** Appelé à chaque point GPS : déclare l'arrivée quand le véhicule atteint le site. */
export async function detectArrival(session: SessionPayload, lotId: number, point: GeoPoint & { accuracy?: number | null }) {
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: { destinationSite: { select: { latitude: true, longitude: true } }, convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true } } },
  });
  if (!lot) return null;
  const destination = siteGeoPoint(lot.destinationSite);
  if (!convoyState(lot.convoyEvents).onTheRoad || !isAtDestination(point, destination)) return null;
  return recordConvoyEvent(session, lotId, "ARRIVEE", point, true);
}

export async function getConvoyOverview(lotId: number) {
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      destinationSite: { select: { latitude: true, longitude: true } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, user: { select: { name: true } } } },
    },
  });
  if (!lot) return null;
  return { destination: siteGeoPoint(lot.destinationSite), events: lot.convoyEvents, state: convoyState(lot.convoyEvents) };
}

export { distanceMeters };
