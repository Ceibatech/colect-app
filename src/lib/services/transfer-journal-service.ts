import "server-only";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { distanceMeters, minutesBetween } from "@/lib/transfers/convoy";

export type JournalEntry = { at: Date; label: string; by: string | null; detail: string | null; kind: "circuit" | "document" | "terrain" | "trajet" };

const MOVEMENT_LABELS: Record<string, string> = { SORTIE: "Bordereau de sortie (F02)", RECEPTION: "Constat de réception (F03)", RETOUR: "Bordereau de retour" };

const AUDIT_LABELS: Record<string, { label: string; kind: JournalEntry["kind"] }> = {
  TRANSFER_LOT_CREATE: { label: "Lot créé", kind: "circuit" },
  TRANSFER_LOT_SUBMIT: { label: "Lot soumis à la validation interne", kind: "circuit" },
  TRANSFER_LOT_CEIBAC_APPROVE: { label: "Validation interne signée", kind: "circuit" },
  TRANSFER_LOT_AUTHORIZE: { label: "Autorisation SDA signée (F01)", kind: "circuit" },
  TRANSFER_RECEPTION_CEIBAC_VALIDATE: { label: "Constat de réception validé en interne", kind: "document" },
  TRANSFER_SORTIE_MINISTRY_VALIDATE: { label: "F02 contre-signé par le SDA : stock du site de départ décrémenté, lot en transit", kind: "document" },
  TRANSFER_RECEPTION_MINISTRY_VALIDATE: { label: "F03 contre-signé par le SDA : dossiers intégrés au stock du site d'arrivée", kind: "document" },
  TRANSFER_RETOUR_MINISTRY_VALIDATE: { label: "Retour contre-signé par le SDA : dossiers réintégrés au site d'origine", kind: "document" },
};

const duree = (m: number) => (m < 1 ? "moins d'une minute" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);

const time = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Journal horodaté de toutes les actions d'un lot : circuit de validation,
 * bordereaux et signatures, chargement, départ, trajet GPS, arrivée,
 * déchargement. Chaque ligne dit quand, qui et quoi.
 */
export async function getTransferLotJournal(lotId: number): Promise<JournalEntry[]> {
  await requirePermission("TRANSFER_VIEW");
  const lot = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      createdAt: true,
      movements: { select: { id: true, reference: true, type: true, occurredAt: true, createdAt: true, createdBy: { select: { name: true } } } },
      convoyEvents: { orderBy: { occurredAt: "asc" }, select: { type: true, occurredAt: true, automatic: true, details: true, user: { select: { name: true } } } },
      trackingPoints: { orderBy: { capturedAt: "asc" }, select: { latitude: true, longitude: true, capturedAt: true, capturedBy: { select: { name: true } } } },
    },
  });
  if (!lot) return [];
  const movementIds = lot.movements.map((movement) => movement.id);
  // Les identifiants de lots et de bordereaux réinitialisés ont pu être réattribués :
  // seules les traces postérieures à la création de ce lot lui appartiennent.
  const depuis = new Date(lot.createdAt.getTime() - 5_000);
  const audits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: depuis }, OR: [{ entity: "TRANSFER_LOT", entityId: lotId }, ...(movementIds.length ? [{ entity: "TRANSFER_MOVEMENT", entityId: { in: movementIds } }] : [])] },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true, entityId: true, user: { select: { name: true } } },
  });
  const entries: JournalEntry[] = [];
  const movementRef = new Map(lot.movements.map((movement) => [movement.id, movement.reference]));

  for (const audit of audits) {
    const known = AUDIT_LABELS[audit.action];
    if (known) entries.push({ at: audit.createdAt, label: known.label, by: audit.user?.name ?? null, detail: audit.action.includes("MINISTRY") || audit.action.includes("RECEPTION") ? movementRef.get(audit.entityId ?? 0) ?? null : null, kind: known.kind });
  }
  for (const movement of lot.movements) {
    entries.push({ at: movement.createdAt, label: `${MOVEMENT_LABELS[movement.type] ?? movement.type} établi et signé`, by: movement.createdBy?.name ?? null, detail: `${movement.reference} · heure déclarée ${time.format(movement.occurredAt)}`, kind: "document" });
  }

  const CONVOY_LABELS: Record<string, string> = {
    CHARGEMENT_DEBUT: "Début du chargement", CHARGEMENT_FIN: "Fin du chargement", DEPART: "Fiche de départ du convoyeur",
    EN_ROUTE: "Véhicule en route", ARRIVEE: "Véhicule arrivé", DECHARGEMENT_DEBUT: "Début du déchargement", DECHARGEMENT_FIN: "Fin du déchargement",
  };
  let loadingStart: Date | null = null;
  let unloadingStart: Date | null = null;
  let moving: Date | null = null;
  for (const event of lot.convoyEvents) {
    const details = (event.details ?? {}) as { etaAt?: string; distanceKm?: number; vehicleRegistration?: string; driverName?: string; cartonsChecked?: number; cartonsExpected?: number; missingNote?: string | null };
    let detail: string | null = null;
    if (event.type === "CHARGEMENT_DEBUT") loadingStart = event.occurredAt;
    if (event.type === "CHARGEMENT_FIN") { const m = minutesBetween(loadingStart, event.occurredAt); detail = m != null ? `durée du chargement : ${duree(m)}` : null; }
    if (event.type === "DEPART") detail = [details.vehicleRegistration && `véhicule ${details.vehicleRegistration}`, details.driverName && `chauffeur ${details.driverName}`, details.cartonsExpected != null && `${details.cartonsChecked}/${details.cartonsExpected} cartons contrôlés`, details.missingNote && `écart : ${details.missingNote}`].filter(Boolean).join(", ") || null;
    if (event.type === "EN_ROUTE") { moving = event.occurredAt; detail = [event.automatic ? "mouvement détecté par GPS" : "signalé par le convoyeur", details.etaAt && `arrivée estimée ${time.format(new Date(details.etaAt))}`, details.distanceKm && `${String(details.distanceKm).replace(".", ",")} km`].filter(Boolean).join(", "); }
    if (event.type === "ARRIVEE") { const m = minutesBetween(moving, event.occurredAt); detail = [event.automatic ? "détectée par GPS" : "déclarée par le convoyeur", m != null ? `trajet : ${duree(m)}` : null].filter(Boolean).join(", "); }
    if (event.type === "DECHARGEMENT_DEBUT") unloadingStart = event.occurredAt;
    if (event.type === "DECHARGEMENT_FIN") { const m = minutesBetween(unloadingStart, event.occurredAt); detail = m != null ? `durée du déchargement : ${duree(m)}` : null; }
    entries.push({ at: event.occurredAt, label: CONVOY_LABELS[event.type] ?? event.type, by: event.automatic ? "GPS" : event.user?.name ?? null, detail, kind: event.type.includes("CHARGEMENT") ? "terrain" : "trajet" });
  }

  // Trajet GPS : premier et dernier point, distance parcourue.
  const points = lot.trackingPoints;
  if (points.length) {
    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += distanceMeters(points[i - 1], points[i]);
    entries.push({ at: points[0].capturedAt, label: "Premier point GPS reçu", by: points[0].capturedBy?.name ?? null, detail: `${points.length} point${points.length > 1 ? "s" : ""} enregistré${points.length > 1 ? "s" : ""} pendant le trajet`, kind: "trajet" });
    if (points.length > 1) entries.push({ at: points[points.length - 1].capturedAt, label: "Dernier point GPS reçu", by: points[points.length - 1].capturedBy?.name ?? null, detail: `distance parcourue : ${(meters / 1000).toFixed(1).replace(".", ",")} km`, kind: "trajet" });
  }

  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}
