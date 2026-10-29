import "server-only";
import { prisma } from "@/lib/prisma/client";
import { ApiError } from "@/lib/utils/api-error";
import { SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";
import { notifyTransferWorkflow } from "@/lib/services/transfer-notification-service";
import { convoyState, distanceMeters, isAtDestination, type GeoPoint } from "@/lib/transfers/convoy";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ConvoyDepartureInput } from "@/lib/validation/transfer";

/** Auteur d'un jalon ou d'un point GPS : session web, ou téléphone Traccar Client. */
export type ConvoyActor = { userId: number; name: string; roleCode?: string };

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
export async function assertConvoyActor(session: ConvoyActor, lotId: number) {
  if (session.roleCode !== "CONVOYEUR") return;
  const assigned = await prisma.transferLotParticipant.findFirst({ where: { transferLotId: lotId, userId: session.userId }, select: { id: true } });
  if (!assigned) throw new ApiError("Vous n'êtes pas désigné comme convoyeur de ce lot.", 403);
}

/** Seul le responsable du site d'arrivée est alerté (l'auteur du lot s'il n'y en a pas). */
async function recipients(lot: { createdById: number; destinationSiteId: number }) {
  const responsibles = await prisma.userSite.findMany({
    where: { siteId: lot.destinationSiteId, user: { isActive: true, role: { code: SITE_RESPONSIBLE_ROLE_CODE } } },
    select: { userId: true },
  });
  return responsibles.length ? [...new Set(responsibles.map((row) => row.userId))] : [lot.createdById];
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
      recipientUserIds: await recipients(lot),
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

export async function recordConvoyEvent(session: ConvoyActor, lotId: number, type: "DEPART" | "ARRIVEE", position?: GeoPoint | null, automatic = false, details?: Prisma.InputJsonValue) {
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
      data: { transferLotId: lotId, type, userId: session.userId, latitude: position?.latitude, longitude: position?.longitude, automatic, details },
      select: { id: true, occurredAt: true },
    });
  });
  if (!event) return { created: false, state };
  await notify(event.id, type, lot, event.occurredAt, session.name, automatic);
  return { created: true, state: convoyState([...lot.convoyEvents, { type, occurredAt: event.occurredAt, automatic }]) };
}

/** Appelé à chaque point GPS : déclare l'arrivée quand le véhicule atteint le site. */
export async function detectArrival(session: ConvoyActor, lotId: number, point: GeoPoint & { accuracy?: number | null }) {
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

/**
 * Départ avec fiche : véhicule, chauffeur, scellés et cartons contrôlés au
 * chargement. Un carton non coché doit être expliqué.
 */
export async function startConvoy(session: ConvoyActor, lotId: number, input: ConvoyDepartureInput, position?: GeoPoint | null) {
  const items = await prisma.transferLotItem.findMany({
    where: { transferLotId: lotId, status: "SORTI" },
    select: { id: true, cartonId: true, cartonCode: true },
  });
  if (items.length === 0) throw new ApiError("Aucun carton n'est en transit sur ce lot : la remise au départ (F02) doit d'abord être contre-signée.", 409);
  const expected = new Set(items.map((item) => item.id));
  const checked = [...new Set(input.checkedItemIds)].filter((id) => expected.has(id));
  const missing = items.filter((item) => !checked.includes(item.id));
  if (missing.length && !input.missingNote?.trim()) {
    throw new ApiError(`${missing.length} carton(s) non contrôlé(s) : expliquez pourquoi avant de partir.`, 400);
  }
  return recordConvoyEvent(session, lotId, "DEPART", position, false, {
    vehicleRegistration: input.vehicleRegistration,
    driverName: input.driverName,
    driverPhone: input.driverPhone || null,
    sealReferences: input.sealReferences || null,
    cartonsExpected: items.length,
    cartonsChecked: checked.length,
    missingItemIds: missing.map((item) => item.id),
    missingNote: input.missingNote || null,
  });
}

export const MIN_POINT_INTERVAL_MS = 8_000;

/** Enregistre un point GPS (navigateur ou Traccar Client) et détecte l'arrivée. */
export async function recordTrackingPoint(
  actor: ConvoyActor,
  lotId: number,
  point: GeoPoint & { accuracy?: number; speed?: number; heading?: number; capturedAt: Date },
) {
  if (point.capturedAt.getTime() > Date.now() + 5 * 60_000) throw new ApiError("La date GPS ne peut pas être dans le futur.", 400);
  const lot = await prisma.transferLot.findFirst({ where: { id: lotId, items: { some: { status: "SORTI" } } }, select: { id: true } });
  if (!lot) throw new ApiError("Le suivi GPS est disponible uniquement lorsqu'un chargement est en transit.", 409);
  await assertConvoyActor(actor, lotId);
  const lastPoint = await prisma.transferTrackingPoint.findFirst({
    where: { transferLotId: lotId, capturedById: actor.userId },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });
  if (lastPoint && point.capturedAt.getTime() - lastPoint.capturedAt.getTime() < MIN_POINT_INTERVAL_MS) {
    throw new ApiError("Attendez quelques secondes avant le prochain point GPS.", 429);
  }
  const created = await prisma.transferTrackingPoint.create({
    data: {
      transferLotId: lotId,
      capturedById: actor.userId,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      speed: point.speed,
      heading: point.heading,
      capturedAt: point.capturedAt,
    },
    select: { id: true, capturedAt: true },
  });
  const arrival = await detectArrival(actor, lotId, point);
  return { point: created, arrived: !!arrival?.created };
}

/** Identifiant à saisir dans Traccar Client (créé à la première demande). */
export async function getTrackerToken(userId: number) {
  const existing = await prisma.convoyTrackerToken.findUnique({ where: { userId }, select: { token: true, lastSeenAt: true } });
  if (existing) return existing;
  const token = `geo-${randomBytes(12).toString("hex")}`;
  return prisma.convoyTrackerToken.upsert({
    where: { userId },
    create: { userId, token },
    update: {},
    select: { token: true, lastSeenAt: true },
  });
}

/**
 * Point reçu de Traccar Client : rattaché au convoi en route du convoyeur
 * (départ déclaré, pas encore arrivé). Sans convoi en route, ignoré.
 */
export async function recordTrackerPosition(position: { deviceId: string } & GeoPoint & { accuracy?: number; speed?: number; heading?: number; capturedAt: Date }) {
  const tracker = await prisma.convoyTrackerToken.findUnique({
    where: { token: position.deviceId },
    select: { id: true, user: { select: { id: true, name: true, isActive: true, role: { select: { code: true } } } } },
  });
  if (!tracker || !tracker.user.isActive) return { status: "unknown-device" as const };
  await prisma.convoyTrackerToken.update({ where: { id: tracker.id }, data: { lastSeenAt: new Date() } });
  const lots = await prisma.transferLot.findMany({
    where: { items: { some: { status: "SORTI" } }, participants: { some: { userId: tracker.user.id } } },
    select: { id: true, convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true } } },
  });
  const onTheRoad = lots
    .map((lot) => ({ id: lot.id, state: convoyState(lot.convoyEvents) }))
    .filter((lot) => lot.state.onTheRoad)
    .sort((a, b) => (b.state.departedAt?.getTime() ?? 0) - (a.state.departedAt?.getTime() ?? 0))[0];
  if (!onTheRoad) return { status: "no-convoy" as const };
  const actor = { userId: tracker.user.id, name: tracker.user.name, roleCode: tracker.user.role.code };
  try {
    const result = await recordTrackingPoint(actor, onTheRoad.id, position);
    return { status: "recorded" as const, lotId: onTheRoad.id, arrived: result.arrived };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 429 || error.status === 409)) return { status: "skipped" as const };
    throw error;
  }
}

export { distanceMeters };
