import "server-only";
import { prisma } from "@/lib/prisma/client";
import { ApiError } from "@/lib/utils/api-error";
import { SITE_RESPONSIBLE_ROLE_CODE } from "@/lib/permissions/constants";
import { notifyTransferWorkflow } from "@/lib/services/transfer-notification-service";
import { convoyState, distanceMeters, hasLeft, isAtDestination, refusEtape, type ConvoyEventType, type GeoPoint } from "@/lib/transfers/convoy";
import { buildOsrmRouteUrl, summarizeOsrmRoute } from "@/lib/transfers/route-suggestion";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ConvoyDepartureInput } from "@/lib/validation/transfer";

/** Auteur d'un jalon ou d'un point GPS : session web, ou téléphone Traccar Client. */
export type ConvoyActor = { userId: number; name: string; roleCode?: string };

/**
 * Étapes des convois. Au site de départ, le responsable indique le début et
 * la fin du chargement (le convoyeur est alors prévenu). Le convoyeur remplit
 * la fiche de départ ; dès que le GPS montre que le véhicule a quitté le site,
 * le responsable du site d'arrivée est alerté avec l'heure d'arrivée estimée.
 * À l'arrivée (bouton, ou position à moins de 150 m du site), il est de
 * nouveau prévenu, puis il indique le début et la fin du déchargement.
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
      sourceSite: { select: { nom: true, latitude: true, longitude: true } },
      destinationSite: { select: { nom: true, latitude: true, longitude: true } },
      items: { where: { status: "SORTI" }, select: { dossierCountSnapshot: true } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, details: true } },
    },
  });
}

/** Le convoyeur ne déclare que les convois où il est désigné. */
export async function assertConvoyActor(session: ConvoyActor, lotId: number) {
  if (session.roleCode !== "CONVOYEUR") return;
  const assigned = await prisma.transferLotParticipant.findFirst({ where: { transferLotId: lotId, userId: session.userId }, select: { id: true } });
  if (!assigned) throw new ApiError("Vous n'êtes pas désigné comme convoyeur de ce lot.", 403);
}

/** Responsables actifs du site d'arrivée (l'auteur du lot s'il n'y en a pas). */
async function destinationResponsibles(lot: { createdById: number; destinationSiteId: number }) {
  const responsibles = await prisma.userSite.findMany({
    where: { siteId: lot.destinationSiteId, user: { isActive: true, role: { code: SITE_RESPONSIBLE_ROLE_CODE } } },
    select: { userId: true },
  });
  return responsibles.length ? [...new Set(responsibles.map((row) => row.userId))] : [lot.createdById];
}

/** Convoyeurs désignés sur le lot (l'auteur du lot s'il n'y en a pas). */
async function lotConvoyeurs(lot: { id: number; createdById: number }) {
  const rows = await prisma.transferLotParticipant.findMany({ where: { transferLotId: lot.id, roleCode: "CONVOYEUR", user: { isActive: true } }, select: { userId: true } });
  return rows.length ? [...new Set(rows.map((row) => row.userId))] : [lot.createdById];
}

async function notify(eventId: number, type: ConvoyEventType, lot: NonNullable<Awaited<ReturnType<typeof loadLot>>>, at: Date, by: string, automatic: boolean, details?: { etaAt?: string; distanceKm?: number; durationMinutes?: number } | null) {
  // Chaque étape n'alerte que l'acteur suivant ; les autres se suivent dans l'application.
  if (type !== "CHARGEMENT_FIN" && type !== "EN_ROUTE" && type !== "ARRIVEE") return;
  const cartons = lot.items.length;
  const dossiers = lot.items.reduce((sum, item) => sum + item.dossierCountSnapshot, 0);
  const route = `${lot.sourceSite.nom} → ${lot.destinationSite.nom}`;
  const eta = details?.etaAt ? timeFormatter.format(new Date(details.etaAt)) : null;
  const content = type === "CHARGEMENT_FIN" ? {
    event: "CONVOY_LOADED" as const,
    recipients: await lotConvoyeurs(lot),
    title: `Convoi ${lot.reference} chargé`,
    message: `Le chargement est terminé à ${lot.sourceSite.nom}. Remplissez la fiche de départ dans « Mes convois » et laissez le suivi GPS actif : le site d'arrivée sera prévenu dès que le véhicule roule.`,
    statusLabel: "Chargement terminé",
    actionPath: "/transferts/convois",
    actionLabel: "Démarrer le trajet",
    when: "Fin du chargement",
  } : type === "EN_ROUTE" ? {
    event: "CONVOY_DEPARTED" as const,
    recipients: await destinationResponsibles(lot),
    title: `Convoi ${lot.reference} en route${eta ? ` : arrivée vers ${eta}` : ""}`,
    message: `Le véhicule a quitté ${lot.sourceSite.nom}${automatic ? " (mouvement détecté par GPS)" : ""} et se dirige vers ${lot.destinationSite.nom}.${eta ? ` Arrivée estimée vers ${eta}, circulation comprise de façon approximative.` : ""} Préparez la réception : vous serez prévenu à son arrivée.`,
    statusLabel: eta ? `Arrivée estimée vers ${eta}` : "Convoi en route",
    actionPath: `/transferts/${lot.id}`,
    actionLabel: "Suivre le trajet",
    when: "En route depuis",
  } : {
    event: "CONVOY_ARRIVED" as const,
    recipients: await destinationResponsibles(lot),
    title: `Convoi ${lot.reference} arrivé à ${lot.destinationSite.nom}`,
    message: `Le véhicule est arrivé à ${lot.destinationSite.nom}${automatic ? " (position détectée automatiquement)" : ""}. Indiquez le début du déchargement dans « Mon site », contrôlez les cartons et signez l'état des lieux (F03).`,
    statusLabel: "Véhicule arrivé",
    actionPath: "/transferts/mon-site",
    actionLabel: "Réceptionner",
    when: "Arrivée",
  };
  try {
    await notifyTransferWorkflow({
      event: content.event,
      entityType: "TRANSFER_CONVOY",
      entityId: eventId,
      recipientRoleCodes: [],
      recipientUserIds: content.recipients,
      title: content.title,
      message: content.message,
      reference: lot.reference,
      statusLabel: content.statusLabel,
      actionPath: content.actionPath,
      actionLabel: content.actionLabel,
      details: [
        { label: "Trajet", value: route },
        { label: content.when, value: timeFormatter.format(at) },
        ...(eta ? [{ label: "Arrivée estimée", value: `${eta}${details?.distanceKm ? ` (${details.distanceKm.toFixed(1).replace(".", ",")} km)` : ""}` }] : []),
        { label: "Déclaré par", value: by },
        { label: "Chargement", value: `${cartons} carton${cartons > 1 ? "s" : ""}, ${dossiers} dossier${dossiers > 1 ? "s" : ""}` },
      ],
    });
  } catch (error) {
    // L'étape est enregistrée ; une panne de messagerie ne doit pas la masquer.
    console.error("Convoy notification failed.", { eventId, type, error });
  }
}

/** Les étapes du trajet exigent des cartons sortis (F02 contre-signé). */
const NEEDS_CARTONS_IN_TRANSIT = new Set<ConvoyEventType>(["DEPART", "EN_ROUTE", "ARRIVEE"]);

export async function recordConvoyEvent(session: ConvoyActor, lotId: number, type: ConvoyEventType, position?: GeoPoint | null, automatic = false, details?: Prisma.InputJsonValue) {
  const lot = await loadLot(lotId);
  if (!lot) throw new ApiError("Lot introuvable.", 404);
  if (NEEDS_CARTONS_IN_TRANSIT.has(type) && lot.items.length === 0) throw new ApiError("Aucun carton n'est en transit sur ce lot : la remise au départ (F02) doit d'abord être contre-signée.", 409);
  const state = convoyState(lot.convoyEvents);
  // Une étape déjà franchie (double clic, détection répétée) n'est pas une erreur.
  const alreadyDone = (type === "DEPART" && state.onTheRoad) || (type === "ARRIVEE" && state.arrived) || (type === "EN_ROUTE" && !!state.movingAt);
  if (alreadyDone) return { created: false, state };
  const refusal = refusEtape(lot.convoyEvents, type);
  if (refusal) {
    if (automatic) return { created: false, state };
    throw new ApiError(refusal, 409);
  }

  const event = await prisma.$transaction(async (tx) => {
    // Sérialise les déclarations simultanées (bouton et détection automatique).
    await tx.$queryRaw`SELECT id FROM transfer_lots WHERE id = ${lotId} FOR UPDATE`;
    const current = await tx.transferConvoyEvent.findMany({ where: { transferLotId: lotId }, orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, details: true } });
    if (refusEtape(current, type)) return null;
    return tx.transferConvoyEvent.create({
      data: { transferLotId: lotId, type, userId: session.userId, latitude: position?.latitude, longitude: position?.longitude, automatic, details },
      select: { id: true, occurredAt: true },
    });
  });
  if (!event) return { created: false, state };
  await notify(event.id, type, lot, event.occurredAt, session.name, automatic, details as { etaAt?: string; distanceKm?: number } | null | undefined);
  return { created: true, state: convoyState([...lot.convoyEvents, { type, occurredAt: event.occurredAt, automatic, details }]) };
}

/**
 * Heure d'arrivée estimée depuis la position du véhicule : itinéraire routier
 * (OpenStreetMap/OSRM, hors trafic) majoré de 30 % pour la circulation ; à
 * défaut, distance à vol d'oiseau à 25 km/h.
 */
export async function estimateArrival(from: GeoPoint, to: GeoPoint | null, now = new Date()) {
  if (!to) return null;
  let distanceKm = (distanceMeters(from, to) * 1.4) / 1000;
  let durationMinutes = (distanceKm / 25) * 60;
  let source = "estimation";
  try {
    const response = await fetch(buildOsrmRouteUrl(from, to), {
      headers: { "User-Agent": "GeoArchives/1.0 (contact: CEIBA Analytics)", Accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    const summary = response.ok ? summarizeOsrmRoute(await response.json()) : null;
    if (summary) { distanceKm = summary.distanceKm; durationMinutes = summary.durationMinutes * 1.3; source = "itineraire"; }
  } catch {
    // Estimation à vol d'oiseau.
  }
  const minutes = Math.max(1, Math.round(durationMinutes));
  return { etaAt: new Date(now.getTime() + minutes * 60_000).toISOString(), distanceKm: Math.round(distanceKm * 10) / 10, durationMinutes: minutes, source };
}

/** Le véhicule roule : étape « en route » et alerte du site d'arrivée avec l'heure estimée. */
export async function declareMoving(session: ConvoyActor, lotId: number, point: GeoPoint | null, automatic: boolean) {
  const lot = await prisma.transferLot.findUnique({ where: { id: lotId }, select: { destinationSite: { select: { latitude: true, longitude: true } } } });
  if (!lot) throw new ApiError("Lot introuvable.", 404);
  const eta = point ? await estimateArrival(point, siteGeoPoint(lot.destinationSite)) : null;
  return recordConvoyEvent(session, lotId, "EN_ROUTE", point, automatic, eta ?? undefined);
}

/**
 * Appelé à chaque point GPS : signale le véhicule en route dès qu'il a quitté
 * son point de départ, puis déclare l'arrivée quand il atteint le site.
 */
export async function detectArrival(session: ConvoyActor, lotId: number, point: GeoPoint & { accuracy?: number | null }) {
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      sourceSite: { select: { latitude: true, longitude: true } },
      destinationSite: { select: { latitude: true, longitude: true } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, details: true, latitude: true, longitude: true } },
    },
  });
  if (!lot) return null;
  const state = convoyState(lot.convoyEvents);
  if (!state.onTheRoad) return null;
  const destination = siteGeoPoint(lot.destinationSite);
  if (!state.movingAt) {
    const departure = [...lot.convoyEvents].reverse().find((event) => event.type === "DEPART");
    const start = siteGeoPoint(lot.sourceSite) ?? (departure ? siteGeoPoint(departure) : null) ?? await firstPointSince(lotId, state.departedAt);
    if (hasLeft(point, start) || isAtDestination(point, destination)) await declareMoving(session, lotId, point, true);
  }
  if (!isAtDestination(point, destination)) return null;
  return recordConvoyEvent(session, lotId, "ARRIVEE", point, true);
}

/** Premier point GPS reçu après le départ : référence quand le site n'a pas de coordonnées. */
async function firstPointSince(lotId: number, since: Date | null) {
  if (!since) return null;
  const first = await prisma.transferTrackingPoint.findFirst({ where: { transferLotId: lotId, capturedAt: { gte: since } }, orderBy: { capturedAt: "asc" }, select: { latitude: true, longitude: true } });
  return first ? siteGeoPoint(first) : null;
}

export async function getConvoyOverview(lotId: number) {
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      destinationSite: { select: { latitude: true, longitude: true } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, details: true, user: { select: { name: true } } } },
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

/** Étapes du site : chargement au départ, déchargement à l'arrivée. */
export const SITE_STEPS = {
  "chargement-debut": { type: "CHARGEMENT_DEBUT", end: "source" },
  "chargement-fin": { type: "CHARGEMENT_FIN", end: "source" },
  "dechargement-debut": { type: "DECHARGEMENT_DEBUT", end: "destination" },
  "dechargement-fin": { type: "DECHARGEMENT_FIN", end: "destination" },
} as const satisfies Record<string, { type: ConvoyEventType; end: "source" | "destination" }>;

export async function recordSiteStep(session: ConvoyActor, lotId: number, step: keyof typeof SITE_STEPS) {
  const { type, end } = SITE_STEPS[step];
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: { sourceSiteId: true, destinationSiteId: true, movements: { where: { type: "SORTIE", status: { not: "REJETE" } }, select: { id: true }, take: 1 } },
  });
  if (!lot) throw new ApiError("Lot introuvable.", 404);
  if (end === "source" && lot.movements.length === 0) throw new ApiError("Faites d'abord l'état des lieux de sortie (F02) : le chargement vient ensuite.", 409);
  // Un responsable de site n'agit que sur son site : départ pour le chargement, arrivée pour le déchargement.
  if (session.roleCode === SITE_RESPONSIBLE_ROLE_CODE) {
    const siteId = end === "source" ? lot.sourceSiteId : lot.destinationSiteId;
    const mine = await prisma.userSite.findFirst({ where: { userId: session.userId, siteId }, select: { userId: true } });
    if (!mine) throw new ApiError(end === "source" ? "Seul le responsable du site de départ indique le chargement." : "Seul le responsable du site d'arrivée indique le déchargement.", 403);
  }
  return recordConvoyEvent(session, lotId, type);
}
