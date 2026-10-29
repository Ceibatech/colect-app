"use server";

import { randomUUID } from "node:crypto";
import { Prisma, type TransferItemStatus, type TransferLotStatus, type TransferMovementType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { notifyTransferWorkflow } from "@/lib/services/transfer-notification-service";
import { authorizeTransferLotSchema, createTransferLotSchema, recordTransferMovementSchema, transferApprovalSchema } from "@/lib/validation/transfer";
import {
  deriveTransferLotStatus,
  getTransferMovementRule,
  isTransferMovementChronologyValid,
  type TransferItemStatusCode,
  type TransferLotStatusCode,
} from "@/lib/utils/transfer-stock";
import { getClientIp } from "@/lib/utils/server-request";
import { buildTransferCartonToken, MAX_TRANSFER_CARTONS } from "@/lib/transfers/carton-selection";
import { resolveTransferDirection } from "@/lib/transfers/direction";
import { canSignMovementAtSite, movementEnds } from "@/lib/transfers/site-scope";
import { participantAllowedOnSide, type ParticipantUser } from "@/lib/transfers/participants";
import { resolveMultiChoice, resolveSingleChoice, SECURITY_MEASURES, TRANSFER_RISKS, TRANSPORT_METHODS } from "@/lib/transfers/planning-options";
import { getRoleLabel, SITE_RESPONSIBLE_ROLE_CODE, type RoleCode } from "@/lib/permissions/constants";
import { cartonWhereFromToken, getCartonDisplay, parseCartonToken } from "@/lib/workflow/carton-identity";
import { dechargerCartons } from "@/lib/services/caisse-service";
import { signataireDe } from "@/lib/transfers/signataire";

export interface TransferActionState {
  success?: boolean;
  error?: string;
  message?: string;
  lotId?: number;
}

class TransferRuleError extends Error {}

function parseStringList(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

type TransferNotificationInput = Parameters<typeof notifyTransferWorkflow>[0];

function formatTransferDate(value: Date | null): string {
  if (!value) return "À planifier";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Abidjan" }).format(value);
}

function cleanReferencePart(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
}

async function notifyAfterTransferCommit(input: TransferNotificationInput): Promise<void> {
  try {
    const result = await notifyTransferWorkflow(input);
    if (result.failed > 0) {
      console.error("One or more transfer notifications failed.", { event: input.event, entityId: input.entityId, ...result });
    }
  } catch (error) {
    // Le jalon métier est déjà validé. Une panne de messagerie ne doit jamais
    // annuler ni masquer l'opération de transfert enregistrée en base.
    console.error("Transfer workflow notification failed after commit.", { event: input.event, entityId: input.entityId, error });
  }
}

async function runAfterTransferCommit(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    console.error("Transfer post-commit task failed.", error);
  }
}

async function getTransferLotNotificationSummary(id: number) {
  const lot = await prisma.transferLot.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      plannedAt: true,
      createdById: true,
      sourceSite: { select: { nom: true } },
      destinationSite: { select: { nom: true } },
      items: { select: { dossierCountSnapshot: true } },
    },
  });
  if (!lot) return null;
  return {
    ...lot,
    cartonCount: lot.items.length,
    dossierCount: lot.items.reduce((total, item) => total + item.dossierCountSnapshot, 0),
  };
}

async function getTransferMovementNotificationSummary(id: number) {
  const movement = await prisma.transferMovement.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      type: true,
      incidentReported: true,
      fromSiteId: true,
      toSiteId: true,
      transferLot: {
        select: {
          id: true,
          reference: true,
          createdById: true,
          sourceSite: { select: { nom: true } },
          destinationSite: { select: { nom: true } },
        },
      },
      items: { select: { transferLotItem: { select: { dossierCountSnapshot: true } } } },
    },
  });
  if (!movement) return null;
  return {
    ...movement,
    cartonCount: movement.items.length,
    dossierCount: movement.items.reduce((total, item) => total + item.transferLotItem.dossierCountSnapshot, 0),
  };
}

async function getReadyTransferOperationSummary(lotId: number) {
  const selected = await prisma.transferLot.findUnique({
    where: { id: lotId },
    select: {
      plannedAt: true,
      sourceSiteId: true,
      sourceEntrepotId: true,
      destinationSiteId: true,
      destinationEntrepotId: true,
      sourceSite: { select: { code: true, nom: true } },
      destinationSite: { select: { code: true, nom: true } },
    },
  });
  if (!selected?.plannedAt) return null;

  const start = new Date(Date.UTC(selected.plannedAt.getUTCFullYear(), selected.plannedAt.getUTCMonth(), selected.plannedAt.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const lots = await prisma.transferLot.findMany({
    where: {
      plannedAt: { gte: start, lt: end },
      sourceSiteId: selected.sourceSiteId,
      sourceEntrepotId: selected.sourceEntrepotId,
      destinationSiteId: selected.destinationSiteId,
      destinationEntrepotId: selected.destinationEntrepotId,
      status: { not: "ANNULE" },
    },
    select: { authorizedAt: true, createdById: true, items: { select: { dossierCountSnapshot: true } } },
  });
  if (lots.length === 0 || lots.some((lot) => !lot.authorizedAt)) return null;

  const date = start.toISOString().slice(0, 10);
  return {
    reference: `TRF-${date.replaceAll("-", "")}-${cleanReferencePart(selected.sourceSite.code)}-${cleanReferencePart(selected.destinationSite.code)}`,
    plannedAt: start,
    sourceName: selected.sourceSite.nom,
    destinationName: selected.destinationSite.nom,
    lotCount: lots.length,
    cartonCount: lots.reduce((total, lot) => total + lot.items.length, 0),
    dossierCount: lots.reduce((total, lot) => total + lot.items.reduce((subtotal, item) => subtotal + item.dossierCountSnapshot, 0), 0),
    sourceSiteId: selected.sourceSiteId,
    createdByIds: [...new Set(lots.map((lot) => lot.createdById))],
  };
}

function lotNotificationDetails(lot: NonNullable<Awaited<ReturnType<typeof getTransferLotNotificationSummary>>>) {
  return [
    { label: "Date prévue", value: formatTransferDate(lot.plannedAt) },
    { label: "Trajet", value: `${lot.sourceSite.nom} → ${lot.destinationSite.nom}` },
    { label: "Cartons", value: String(lot.cartonCount) },
    { label: "Dossiers", value: String(lot.dossierCount) },
  ];
}

function movementNotificationDetails(movement: NonNullable<Awaited<ReturnType<typeof getTransferMovementNotificationSummary>>>) {
  return [
    { label: "Opération", value: movement.transferLot.reference },
    { label: "Mouvement", value: movement.type === "SORTIE" ? "Sortie" : movement.type === "RECEPTION" ? "Réception" : "Retour" },
    { label: "Trajet", value: `${movement.transferLot.sourceSite.nom} → ${movement.transferLot.destinationSite.nom}` },
    { label: "Cartons", value: String(movement.cartonCount) },
    { label: "Dossiers", value: String(movement.dossierCount) },
  ];
}

/** Nom et fonction du compte connecté, imprimés sous sa signature. */
async function signataireConnecte(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, fonction: true, role: { select: { code: true } } } });
  return signataireDe({ name: user.name, fonction: user.fonction, roleCode: user.role.code });
}

/**
 * Chaque avis ne part qu'à l'acteur de l'étape suivante : les autres ne sont
 * pas « dans la boucle ». Sans destinataire désigné, l'auteur du lot est prévenu.
 */
function nextActor(userIds: number[], fallbackUserIds: number[]) {
  return userIds.length ? [...new Set(userIds)] : [...new Set(fallbackUserIds)];
}

async function getLotConvoyeurIds(lotId: number): Promise<number[]> {
  const rows = await prisma.transferLotParticipant.findMany({
    where: { transferLotId: lotId, roleCode: "CONVOYEUR", user: { isActive: true } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

/**
 * Sites d'un responsable de site ; null pour les profils sans restriction de
 * site (gestionnaire des transferts, administrateur).
 */
async function getResponsibleSiteIds(session: { userId: number; roleCode: string }): Promise<number[] | null> {
  if (session.roleCode !== SITE_RESPONSIBLE_ROLE_CODE) return null;
  const rows = await prisma.userSite.findMany({ where: { userId: session.userId }, select: { siteId: true } });
  return rows.map((row) => row.siteId);
}

/** Responsables actifs rattachés aux sites donnés (destinataires des avis). */
async function getSiteResponsibleUserIds(siteIds: number[]): Promise<number[]> {
  const rows = await prisma.userSite.findMany({
    where: { siteId: { in: [...new Set(siteIds)] }, user: { isActive: true, role: { code: SITE_RESPONSIBLE_ROLE_CODE } } },
    select: { userId: true },
  });
  return [...new Set(rows.map((row) => row.userId))];
}

/**
 * Les intervenants sont des comptes actifs du profil de transfert de leur côté :
 * CEIBA (gestionnaire, validateur interne, convoyeur) et SDA (responsable
 * validation SDA), plus les responsables de site du côté de leurs sites. La mention imprimée est figée au nom et au profil.
 */
function resolveParticipants(users: ParticipantUser[], ceibaIds: number[], sdaIds: number[]) {
  const byId = new Map(users.map((user) => [user.id, user]));
  const sides = [
    { side: "CEIBA" as const, ids: [...new Set(ceibaIds)], label: "CEIBA" },
    { side: "SDA" as const, ids: [...new Set(sdaIds)], label: "SDA" },
  ];
  const rows: Array<{ userId: number; side: "CEIBA" | "SDA"; roleCode: string }> = [];
  const texts: Record<"CEIBA" | "SDA", string[]> = { CEIBA: [], SDA: [] };
  for (const { side, ids, label } of sides) {
    for (const id of ids) {
      const user = byId.get(id);
      if (!user || !participantAllowedOnSide(user, side)) {
        return { error: `Un intervenant ${label} n'est plus actif ou n'a pas de profil de transfert ${label}. Actualisez la liste.` };
      }
      if (rows.some((row) => row.userId === id)) return { error: "Un même compte ne peut pas intervenir des deux côtés." };
      rows.push({ userId: id, side, roleCode: user.role.code });
      const organisation = side === "CEIBA" ? "CEIBA" : "MINISTERE";
      const siteNames = user.role.code === SITE_RESPONSIBLE_ROLE_CODE
        ? (user.responsibleSites ?? []).filter((row) => row.site.organisation === organisation).map((row) => row.site.nom)
        : [];
      texts[side].push(`${user.name} — ${getRoleLabel(user.role.code as RoleCode)}${siteNames.length ? ` (${siteNames.join(", ")})` : ""}`);
    }
  }
  return { rows, ceibaText: texts.CEIBA.join("; "), sdaText: texts.SDA.join("; ") };
}

export async function createTransferLot(
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CREATE");
  const parsed = createTransferLotSchema.safeParse({
    sourceSiteId: formData.get("sourceSiteId"),
    sourceEntrepotId: formData.get("sourceEntrepotId"),
    destinationSiteId: formData.get("destinationSiteId"),
    destinationEntrepotId: formData.get("destinationEntrepotId"),
    includeUnlocated: formData.get("includeUnlocated"),
    plannedAt: formData.get("plannedAt"),
    archiveSupport: formData.get("archiveSupport"),
    plannedRoute: formData.get("plannedRoute"),
    transportMethod: formData.get("transportMethod"),
    transportMethodOther: formData.get("transportMethodOther"),
    ceibaParticipantIds: formData.getAll("ceibaParticipantIds"),
    sdaParticipantIds: formData.getAll("sdaParticipantIds"),
    risks: formData.getAll("risks"),
    riskOther: formData.get("riskOther"),
    securityMeasures: formData.getAll("securityMeasures"),
    securityMeasureOther: formData.get("securityMeasureOther"),
    motif: formData.get("motif"),
    cartonTokens: parseStringList(formData.get("cartonTokens")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Lot de transfert invalide." };

  const transportMethod = resolveSingleChoice(TRANSPORT_METHODS, parsed.data.transportMethod, parsed.data.transportMethodOther);
  if (!transportMethod) return { error: "Choisissez le moyen de transport (précisez-le si « Autre »)." };
  const risks = resolveMultiChoice(TRANSFER_RISKS, parsed.data.risks, parsed.data.riskOther);
  if (!risks?.length) return { error: "Cochez les risques identifiés (précisez-les si « Autre »)." };
  const securityMeasures = resolveMultiChoice(SECURITY_MEASURES, parsed.data.securityMeasures, parsed.data.securityMeasureOther);
  if (!securityMeasures?.length) return { error: "Cochez les mesures de sécurisation (précisez-les si « Autre »)." };

  if (
    parsed.data.sourceSiteId === parsed.data.destinationSiteId
    && (parsed.data.sourceEntrepotId ?? null) === (parsed.data.destinationEntrepotId ?? null)
  ) {
    return { error: "Le point de départ et le point de destination doivent être différents." };
  }

  const cartonTokens = [...new Set(parsed.data.cartonTokens)];
  if (cartonTokens.length !== parsed.data.cartonTokens.length) return { error: "Un carton a été sélectionné plusieurs fois." };
  if (cartonTokens.length > MAX_TRANSFER_CARTONS) return { error: `Une opération est limitée à ${MAX_TRANSFER_CARTONS} cartons.` };

  const cartonFilters: Prisma.DossierWhereInput[] = [];
  const cartonIds: number[] = [];
  for (const token of cartonTokens) {
    const identity = parseCartonToken(token);
    const where = cartonWhereFromToken(token);
    if (!identity?.cartonId || !where) {
      return { error: "Un identifiant de carton est invalide. Actualisez la proposition." };
    }
    cartonFilters.push(where);
    cartonIds.push(identity.cartonId);
  }

  const [sourceSite, destinationSite, sourceEntrepot, destinationEntrepot, participantUsers] = await Promise.all([
    prisma.site.findFirst({ where: { id: parsed.data.sourceSiteId, isActive: true }, select: { id: true, organisation: true } }),
    prisma.site.findFirst({ where: { id: parsed.data.destinationSiteId, isActive: true }, select: { id: true, organisation: true } }),
    parsed.data.sourceEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.sourceEntrepotId, siteId: parsed.data.sourceSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    parsed.data.destinationEntrepotId
      ? prisma.entrepot.findFirst({ where: { id: parsed.data.destinationEntrepotId, siteId: parsed.data.destinationSiteId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    prisma.user.findMany({
      where: { id: { in: [...parsed.data.ceibaParticipantIds, ...parsed.data.sdaParticipantIds] }, isActive: true },
      select: { id: true, name: true, role: { select: { code: true } }, responsibleSites: { select: { site: { select: { nom: true, organisation: true } } } } },
    }),
  ]);
  if (!sourceSite || !destinationSite) return { error: "Le site de départ et le site de destination doivent être actifs." };
  const direction = resolveTransferDirection(sourceSite.organisation, destinationSite.organisation);
  if (!direction) {
    return { error: "Une opération relie un site du ministère et un site CEIBA, dans un sens ou dans l'autre." };
  }
  const participants = resolveParticipants(participantUsers, parsed.data.ceibaParticipantIds, parsed.data.sdaParticipantIds);
  if ("error" in participants) return { error: participants.error };
  if (parsed.data.sourceEntrepotId && !sourceEntrepot) return { error: "L'entrepôt de départ est invalide." };
  if (parsed.data.destinationEntrepotId && !destinationEntrepot) return { error: "L'entrepôt de destination est invalide." };

  try {
    const ip = await getClientIp();
    const plannedAt = new Date(parsed.data.plannedAt);
    const result = await prisma.$transaction(async (tx) => {
      // Same lock as inventory intake: no dossier can join a carton while its
      // complete manifest is being captured. Lock in ID order to avoid deadlocks.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM cartons WHERE id IN (${Prisma.join([...cartonIds].sort((a, b) => a - b))}) ORDER BY id FOR UPDATE`);
      const operationStart = new Date(Date.UTC(plannedAt.getUTCFullYear(), plannedAt.getUTCMonth(), plannedAt.getUTCDate()));
      const operationEnd = new Date(operationStart);
      operationEnd.setUTCDate(operationEnd.getUTCDate() + 1);
      const signedOperation = await tx.transferLot.findFirst({
        where: {
          plannedAt: { gte: operationStart, lt: operationEnd },
          sourceSiteId: parsed.data.sourceSiteId,
          sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
          destinationSiteId: parsed.data.destinationSiteId,
          destinationEntrepotId: parsed.data.destinationEntrepotId ?? null,
          authorizedAt: { not: null },
          status: { not: "ANNULE" },
        },
        select: { reference: true },
      });
      if (signedOperation) {
        throw new TransferRuleError(`L'opération de cette date est déjà en cours de signature (${signedOperation.reference}). Planifiez une nouvelle date pour ajouter d'autres cartons.`);
      }

      const dossiers = await tx.dossier.findMany({
        // Fetch the entire carton, including members whose location is NULL.
        // SQL NOT(location) would miss those members because of NULL semantics.
        where: { OR: cartonFilters },
        select: { id: true, reference: true, cartonId: true, siteId: true, entrepotId: true, codeBarres: true, libelleCarton: true, carton: { select: { cote: true } } },
      });
      if (dossiers.some((dossier) => !(parsed.data.includeUnlocated && dossier.siteId === null)
        && !(dossier.siteId === parsed.data.sourceSiteId && dossier.entrepotId === (parsed.data.sourceEntrepotId ?? null)))) {
        throw new TransferRuleError("Les dossiers d'un carton sont répartis entre plusieurs emplacements. Corrigez leur emplacement avant de transférer le carton complet.");
      }

      const selectedTokenSet = new Set(cartonTokens);
      const grouped = new Map<string, { token: string; cartonId: number; code: string; label: string | null; dossiers: typeof dossiers }>();
      for (const dossier of dossiers) {
        const token = buildTransferCartonToken(dossier);
        if (!token || !selectedTokenSet.has(token) || dossier.cartonId == null) continue;
        const display = getCartonDisplay(dossier);
        const group = grouped.get(token) ?? {
          token,
          cartonId: dossier.cartonId,
          code: display.label,
          label: display.description,
          dossiers: [],
        };
        group.dossiers.push(dossier);
        grouped.set(token, group);
      }
      if (grouped.size !== cartonTokens.length) {
        throw new TransferRuleError("Un carton sélectionné n'est plus disponible au point de départ. Actualisez la proposition.");
      }

      const groups = cartonTokens.map((token) => grouped.get(token)!);
      if (new Set(groups.map((group) => group.code)).size !== groups.length) {
        throw new TransferRuleError("Deux cartons portent le même identifiant. Harmonisez les codes avant de constituer l'opération.");
      }
      const dossierIds = groups.flatMap((group) => group.dossiers.map((dossier) => dossier.id));

      const reservedCarton = await tx.transferLotItem.findFirst({
        where: { cartonId: { in: cartonIds }, status: { in: ["PREVU", "SORTI", "RECU"] }, transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } } },
        select: { transferLot: { select: { reference: true } } },
      });
      if (reservedCarton) throw new TransferRuleError(`Un carton appartient déjà au lot ouvert ${reservedCarton.transferLot.reference}.`);
      const conflict = await tx.transferLotDossier.findFirst({
        where: {
          dossierId: { in: dossierIds },
          transferLotItem: {
            status: { in: ["PREVU", "SORTI", "RECU"] },
            transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
          },
        },
        select: {
          dossier: { select: { reference: true } },
          transferLotItem: { select: { transferLot: { select: { reference: true } } } },
        },
      });
      if (conflict) {
        throw new TransferRuleError(`Le carton contenant le dossier ${conflict.dossier.reference} appartient déjà au lot ouvert ${conflict.transferLotItem.transferLot.reference}.`);
      }
      const unlocatedIds = dossiers.filter((dossier) => dossier.siteId === null).map((dossier) => dossier.id);

      const temporaryReference = `TMP-${randomUUID()}`;
      const lot = await tx.transferLot.create({
        data: {
          reference: temporaryReference,
          sourceSiteId: parsed.data.sourceSiteId,
          sourceEntrepotId: parsed.data.sourceEntrepotId ?? null,
          destinationSiteId: parsed.data.destinationSiteId,
          destinationEntrepotId: parsed.data.destinationEntrepotId ?? null,
          plannedAt,
          archiveSupport: parsed.data.archiveSupport,
          plannedRoute: parsed.data.plannedRoute,
          transportMethod,
          ceibaParticipants: participants.ceibaText,
          sdaParticipants: participants.sdaText,
          riskAssessment: risks.join("; "),
          securityMeasures: securityMeasures.join("; "),
          motif: parsed.data.motif || null,
          createdById: session.userId,
        },
      });
      const year = new Date().getUTCFullYear();
      const reference = `LOT-${year}-${String(lot.id).padStart(6, "0")}`;
      await tx.transferLot.update({ where: { id: lot.id }, data: { reference } });
      await tx.transferLotParticipant.createMany({
        data: participants.rows.map((row) => ({ transferLotId: lot.id, ...row })),
      });

      if (unlocatedIds.length > 0) {
        const attached = await tx.dossier.updateMany({
          where: { id: { in: unlocatedIds }, siteId: null },
          data: { siteId: parsed.data.sourceSiteId, entrepotId: parsed.data.sourceEntrepotId ?? null },
        });
        if (attached.count !== unlocatedIds.length) {
          throw new TransferRuleError("L'emplacement d'un dossier historique vient d'être modifié. Actualisez la liste puis réessayez.");
        }
        await tx.carton.updateMany({ where: { id: { in: cartonIds } }, data: { legacyKey: null } });
      }

      await tx.transferLotItem.createMany({
        data: groups.map((group) => ({
          transferLotId: lot.id,
          cartonId: group.cartonId,
          cartonCode: group.code,
          cartonLabel: group.label,
          dossierCountSnapshot: group.dossiers.length,
        })),
      });
      const createdItems = await tx.transferLotItem.findMany({
        where: { transferLotId: lot.id },
        select: { id: true, cartonId: true },
      });
      const itemByCarton = new Map(createdItems.map((item) => [item.cartonId, item.id]));
      await tx.transferLotDossier.createMany({
        data: groups.flatMap((group) => group.dossiers.map((dossier) => ({
          transferLotItemId: itemByCarton.get(group.cartonId)!,
          dossierId: dossier.id,
        }))),
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_CREATE",
          entity: "TRANSFER_LOT",
          entityId: lot.id,
          newValue: { reference, direction, dossierCount: dossierIds.length, attachedToSourceCount: unlocatedIds.length, cartonCount: groups.length, sourceSiteId: parsed.data.sourceSiteId, destinationSiteId: parsed.data.destinationSiteId, participantUserIds: participants.rows.map((row) => row.userId) },
          ipAddress: ip,
        },
      });
      return { id: lot.id, reference };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      // Up to 200 cartons and all their dossiers are checked and saved atomically.
      // The remote inventory database can exceed Prisma's default 5-second limit
      // during the stock checks alone. Keep a bounded budget for this operation.
      maxWait: 10_000,
      timeout: 60_000,
    });

    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    return { success: true, lotId: result.id, message: `L'opération ${result.reference} a été créée avec ${cartonTokens.length} carton${cartonTokens.length > 1 ? "s" : ""}.` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre transfert vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Transfer lot creation failed.", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2028") {
      return { error: "L'enregistrement du lot a dépassé le délai disponible. Consultez le registre avant de réessayer pour vérifier si le lot a été créé." };
    }
    return { error: "Le lot de transfert n'a pas pu être créé." };
  }
}

export async function submitTransferLot(id: number): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_SUBMIT");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "BROUILLON", items: { some: {} } },
        data: { status: "SOUMIS", submittedAt: new Date() },
      });
      if (updated.count !== 1) throw new TransferRuleError("Ce lot n'est plus disponible pour soumission.");
      await tx.auditLog.create({
        data: { userId: session.userId, action: "TRANSFER_LOT_SUBMIT", entity: "TRANSFER_LOT", entityId: id, ipAddress: ip },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const lot = await getTransferLotNotificationSummary(id);
      if (!lot) return;
      await notifyAfterTransferCommit({
        event: "LOT_SUBMITTED",
        entityType: "TRANSFER_LOT",
        entityId: id,
        recipientRoleCodes: ["VALIDATEUR_CEIBAC"],
        title: `Lot ${lot.reference} à valider`,
        message: "Le gestionnaire des transferts a soumis cette opération. Votre validation interne est requise avant sa transmission au SDA.",
        reference: lot.reference,
        statusLabel: "En attente de validation interne",
        actionPath: `/transferts/${id}`,
        actionLabel: "Examiner le lot",
        details: lotNotificationDetails(lot),
      });
    });
    return { success: true, message: "L'opération a été transmise à la validation interne." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("Transfer lot submission failed.", error);
    return { error: "La soumission du lot a échoué." };
  }
}

export async function approveTransferLotByCeibac(
  id: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CEIBAC_APPROVE");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };
  const parsed = transferApprovalSchema.safeParse({
    ...await signataireConnecte(session.userId).then((signataire) => ({ signatoryName: signataire.name, signatoryTitle: signataire.title })),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "SOUMIS", items: { some: {} } },
        data: {
          status: "VALIDE_CEIBAC",
          ceibacValidatedAt: new Date(),
          ceibacValidatedById: session.userId,
          ceibacSignatoryName: parsed.data.signatoryName,
          ceibacSignatoryTitle: parsed.data.signatoryTitle,
          ceibacSignatureData: parsed.data.signature,
        },
      });
      if (updated.count !== 1) throw new TransferRuleError("Cette opération n'attend plus la validation interne.");
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_CEIBAC_APPROVE",
          entity: "TRANSFER_LOT",
          entityId: id,
          newValue: { signatoryName: parsed.data.signatoryName, signatoryTitle: parsed.data.signatoryTitle },
          ipAddress: ip,
        },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const lot = await getTransferLotNotificationSummary(id);
      if (!lot) return;
      await notifyAfterTransferCommit({
        event: "LOT_CEIBA_VALIDATED",
        entityType: "TRANSFER_LOT",
        entityId: id,
        recipientRoleCodes: ["VALIDATEUR_MINISTERE"],
        title: `Autorisation requise pour ${lot.reference}`,
        message: "L'opération a reçu la validation interne. Le responsable habilité du SDA doit maintenant autoriser sa sortie.",
        reference: lot.reference,
        statusLabel: "En attente de l'autorisation du ministère",
        actionPath: `/transferts/${id}`,
        actionLabel: "Autoriser le transfert",
        details: lotNotificationDetails(lot),
      });
    });
    return { success: true, message: "L'opération est validée en interne et transmise au SDA pour autorisation." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("CEIBA lot approval failed.", error);
    return { error: "La validation interne de l'opération a échoué." };
  }
}

export async function authorizeTransferLot(
  id: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_AUTHORIZE");
  if (!Number.isInteger(id) || id <= 0) return { error: "Lot invalide." };
  const parsed = authorizeTransferLotSchema.safeParse({
    ...await signataireConnecte(session.userId).then((signataire) => ({ signatoryName: signataire.name, signatoryTitle: signataire.title })),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.transferLot.updateMany({
        where: { id, status: "VALIDE_CEIBAC", ceibacValidatedAt: { not: null }, items: { some: {} } },
        data: {
          status: "AUTORISE",
          authorizedAt: new Date(),
          authorizedById: session.userId,
          approvalSignatoryName: parsed.data.signatoryName,
          approvalSignatoryTitle: parsed.data.signatoryTitle,
          approvalSignatureData: parsed.data.signature,
        },
      });
      if (updated.count !== 1) throw new TransferRuleError("Cette opération doit recevoir la validation interne avant l'autorisation du SDA, ou a déjà été autorisée.");
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: "TRANSFER_LOT_AUTHORIZE",
          entity: "TRANSFER_LOT",
          entityId: id,
          newValue: { signatoryName: parsed.data.signatoryName, signatoryTitle: parsed.data.signatoryTitle },
          ipAddress: ip,
        },
      });
    });
    revalidatePath(`/transferts/${id}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const operation = await getReadyTransferOperationSummary(id);
      if (!operation) return;
      await notifyAfterTransferCommit({
        event: "AUTHORIZATION_F01_READY",
        entityType: "TRANSFER_OPERATION",
        entityId: id,
        // Autorisation signée par le SDA : seul le responsable du site SDA de départ est alerté.
        recipientRoleCodes: [],
        recipientUserIds: nextActor(await getSiteResponsibleUserIds([operation.sourceSiteId]), operation.createdByIds),
        title: `Autorisation ${operation.reference} disponible`,
        message: "Tous les lots prévus pour cette date et ce trajet sont autorisés. La F01 consolidée est signée et prête pour la préparation du transfert.",
        reference: operation.reference,
        statusLabel: "Document F01 signé disponible",
        actionPath: `/transferts/${id}`,
        actionLabel: "Consulter l'opération",
        documentPath: `/api/transferts/${id}/autorisation`,
        documentLabel: "Télécharger l'autorisation F01",
        details: [
          { label: "Date prévue", value: formatTransferDate(operation.plannedAt) },
          { label: "Trajet", value: `${operation.sourceName} → ${operation.destinationName}` },
          { label: "Lots", value: String(operation.lotCount) },
          { label: "Cartons", value: String(operation.cartonCount) },
          { label: "Dossiers", value: String(operation.dossierCount) },
        ],
      });
    });
    return { success: true, message: "Le lot est autorisé. La F01 consolidée sera disponible lorsque tous les lots de cette date et de ce trajet seront autorisés." };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("Transfer lot authorization failed.", error);
    return { error: "L'autorisation du lot a échoué." };
  }
}

export async function recordTransferMovement(
  lotId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_OPERATE");
  const parsed = recordTransferMovementSchema.safeParse({
    type: formData.get("type"),
    itemIds: formData.getAll("itemIds"),
    occurredAt: formData.get("occurredAt"),
    observations: formData.get("observations"),
    conditionStatus: formData.get("conditionStatus") || undefined,
    vehicleRegistration: formData.get("vehicleRegistration"),
    vehicleDescription: formData.get("vehicleDescription"),
    driverName: formData.get("driverName"),
    driverPhone: formData.get("driverPhone"),
    ceibaEscortName: formData.get("ceibaEscortName"),
    sealReferences: formData.get("sealReferences"),
    sealStatus: formData.get("sealStatus") || undefined,
    incidentReported: formData.get("incidentReported"),
    incidentDescription: formData.get("incidentDescription"),
    ministryName: formData.get("ministryName"),
    ministryTitle: formData.get("ministryTitle"),
    ministrySignature: formData.get("ministrySignature"),
    ...await signataireConnecte(session.userId).then((signataire) => ({ ceibacName: signataire.name, ceibacTitle: signataire.title })),
    ceibacSignature: formData.get("ceibacSignature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Mouvement invalide." };
  if (!Number.isInteger(lotId) || lotId <= 0) return { error: "Lot invalide." };

  const itemIds = [...new Set(parsed.data.itemIds)];
  if (itemIds.length !== parsed.data.itemIds.length) return { error: "Un groupe de dossiers a été sélectionné plusieurs fois." };
  const responsibleSiteIds = await getResponsibleSiteIds(session);
  const occurredAt = new Date(parsed.data.occurredAt);
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return { error: "La date du mouvement ne peut pas être dans le futur." };

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const lot = await tx.transferLot.findUnique({
        where: { id: lotId },
        include: {
          items: {
            select: {
              id: true,
              status: true,
              departedAt: true,
              receivedAt: true,
              dossiers: { select: { dossierId: true } },
            },
          },
        },
      });
      if (!lot) throw new TransferRuleError("Lot introuvable.");
      if (["BROUILLON", "SOUMIS", "VALIDE_CEIBAC", "ANNULE", "CLOTURE"].includes(lot.status)) {
        throw new TransferRuleError(["BROUILLON", "SOUMIS", "VALIDE_CEIBAC"].includes(lot.status) ? "L'opération doit être autorisée par le SDA avant toute sortie." : "Cette opération ne peut plus recevoir de mouvement.");
      }

      const type = parsed.data.type as TransferMovementType;
      const rule = getTransferMovementRule(parsed.data.type);
      const selected = lot.items.filter((item) => itemIds.includes(item.id));
      if (selected.length !== itemIds.length || selected.some((item) => item.status !== rule.before)) {
        throw new TransferRuleError("La sélection contient des dossiers qui ne sont plus disponibles pour ce mouvement.");
      }
      if (selected.some((item) => !isTransferMovementChronologyValid(parsed.data.type, occurredAt, item, lot.createdAt))) {
        throw new TransferRuleError("La date du mouvement doit être postérieure au jalon précédent de chaque groupe de dossiers.");
      }
      const pendingMovement = await tx.transferMovementItem.findFirst({
        where: {
          transferLotItemId: { in: itemIds },
          movement: { status: { in: ["SOUMIS_CEIBAC", "VALIDE_CEIBAC"] } },
        },
        select: { movement: { select: { reference: true } } },
      });
      if (pendingMovement) {
        throw new TransferRuleError(`Le bordereau ${pendingMovement.movement.reference} attend déjà une validation pour cette sélection.`);
      }

      const { fromSiteId, toSiteId } = movementEnds(type, lot);
      if (!canSignMovementAtSite(type, lot, responsibleSiteIds)) {
        const site = await tx.site.findUnique({ where: { id: type === "RECEPTION" ? toSiteId : fromSiteId }, select: { nom: true } });
        throw new TransferRuleError(type === "RECEPTION"
          ? `L'état des lieux d'arrivée revient au responsable du site ${site?.nom ?? "d'arrivée"}.`
          : `La remise des cartons revient au responsable du site ${site?.nom ?? "de départ"}.`);
      }
      const dossierIds = [...new Set(selected.flatMap((item) => item.dossiers.map((link) => link.dossierId)))];
      const temporaryReference = `TMP-${randomUUID()}`;
      const movement = await tx.transferMovement.create({
        data: {
          transferLotId: lot.id,
          reference: temporaryReference,
          type,
          status: type === "RECEPTION" ? "SOUMIS_CEIBAC" : "VALIDE_CEIBAC",
          conditionStatus: type === "RECEPTION" ? parsed.data.conditionStatus : null,
          vehicleRegistration: parsed.data.vehicleRegistration ?? null,
          vehicleDescription: parsed.data.vehicleDescription ?? null,
          driverName: parsed.data.driverName ?? null,
          driverPhone: parsed.data.driverPhone ?? null,
          ceibaEscortName: parsed.data.ceibaEscortName ?? null,
          sealReferences: parsed.data.sealReferences ?? null,
          sealStatus: parsed.data.sealStatus ?? null,
          incidentReported: parsed.data.incidentReported,
          incidentDescription: parsed.data.incidentDescription ?? null,
          occurredAt,
          fromSiteId,
          toSiteId,
          observations: parsed.data.observations || null,
          createdById: session.userId,
          ceibacValidatedAt: type === "RECEPTION" ? null : occurredAt,
          ceibacValidatedById: type === "RECEPTION" ? null : session.userId,
          items: {
            create: selected.map((item) => ({
              transferLotItemId: item.id,
              statusBefore: rule.before as TransferItemStatus,
              statusAfter: rule.after as TransferItemStatus,
            })),
          },
          signatures: {
            create: [{
              party: "CEIBAC",
              signatoryName: parsed.data.ceibacName,
              signatoryTitle: parsed.data.ceibacTitle,
              signatureData: parsed.data.ceibacSignature,
              capturedById: session.userId,
              signedAt: occurredAt,
              ipAddress: ip,
            }],
          },
        },
      });
      const reference = `BTR-${new Date(occurredAt).getUTCFullYear()}-${String(movement.id).padStart(7, "0")}`;
      await tx.transferMovement.update({ where: { id: movement.id }, data: { reference } });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: type === "RECEPTION" ? "TRANSFER_RECEPTION_SUBMIT" : "TRANSFER_MOVEMENT_SUBMIT_MINISTRY",
          entity: "TRANSFER_MOVEMENT",
          entityId: movement.id,
          newValue: {
            reference,
            transferLotId: lot.id,
            type,
            itemCount: itemIds.length,
            dossierCount: dossierIds.length,
            conditionStatus: parsed.data.conditionStatus,
            vehicleRegistration: parsed.data.vehicleRegistration,
            driverName: parsed.data.driverName,
            ceibaEscortName: parsed.data.ceibaEscortName,
            sealStatus: parsed.data.sealStatus,
            incidentReported: parsed.data.incidentReported,
            nextValidator: type === "RECEPTION" ? "CEIBA_VALIDATOR" : "MINISTERE",
          },
          ipAddress: ip,
        },
      });
      return { movementId: movement.id, reference, nextValidator: type === "RECEPTION" ? "CEIBA" : "MINISTERE" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    revalidatePath(`/transferts/${lotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    revalidatePath("/dossiers");
    revalidatePath("/dashboard/geographie");
    await runAfterTransferCommit(async () => {
      const movement = await getTransferMovementNotificationSummary(result.movementId);
      if (!movement) return;
      const incident = movement.incidentReported;
      const recipientRoleCodes = incident
        ? ["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "VALIDATEUR_MINISTERE"] as const
        : movement.type === "RECEPTION"
          ? ["VALIDATEUR_CEIBAC"] as const
          : ["VALIDATEUR_MINISTERE"] as const;
      const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
      await notifyAfterTransferCommit({
        event: incident
          ? "MOVEMENT_INCIDENT_REPORTED"
          : movement.type === "RECEPTION"
            ? "MOVEMENT_SUBMITTED_CEIBA"
            : "MOVEMENT_SUBMITTED_MINISTRY",
        entityType: "TRANSFER_MOVEMENT",
        entityId: movement.id,
        recipientRoleCodes: [...recipientRoleCodes],
        // Seul le valideur de l'étape suivante reçoit le bordereau (l'auteur du lot en cas d'incident).
        recipientUserIds: incident ? [movement.transferLot.createdById] : [],
        title: incident
          ? `Incident déclaré sur ${movement.reference}`
          : movement.type === "RECEPTION"
            ? `Constat ${movement.reference} à viser`
            : `Bordereau ${movement.reference} à contre-signer`,
        message: incident
          ? "Un incident a été déclaré pendant ce mouvement. Consultez immédiatement le dossier sécurisé pour examiner le constat et décider de la suite."
          : movement.type === "RECEPTION"
            ? "Le constat d'arrivée a été soumis. Le responsable interne doit contrôler la réception avant transmission au SDA."
            : "Le bordereau de mouvement a été signé par CEIBA. La contre-signature du SDA est requise avant la mise à jour du stock.",
        reference: movement.reference,
        statusLabel: incident
          ? "Incident à traiter"
          : movement.type === "RECEPTION"
            ? "En attente de validation interne"
            : "En attente du visa du ministère",
        actionPath: `/transferts/${movement.transferLot.id}`,
        actionLabel: incident ? "Examiner l'incident" : "Examiner le bordereau",
        documentPath: `/api/transferts/${movement.transferLot.id}/bordereaux/${movement.id}`,
        documentLabel: `Télécharger le bordereau ${documentCode}`,
        details: movementNotificationDetails(movement),
        alert: incident,
      });
    });
    return {
      success: true,
      message: result.nextValidator === "CEIBA"
        ? `Le constat ${result.reference} est soumis à la validation interne. Le stock reste en transit.`
        : `Le bordereau F02 ${result.reference} est transmis au ministère. Le stock reste inchangé jusqu'à sa contre-signature.`,
    };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre agent vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Transfer movement creation failed.", error);
    return { error: "Le mouvement n'a pas pu être enregistré." };
  }
}

export async function approveReceptionByCeiba(
  movementId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_CEIBAC_VALIDATE");
  if (!Number.isInteger(movementId) || movementId <= 0) return { error: "Constat invalide." };
  const parsed = transferApprovalSchema.safeParse({
    ...await signataireConnecte(session.userId).then((signataire) => ({ signatoryName: signataire.name, signatoryTitle: signataire.title })),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    const movement = await prisma.$transaction(async (tx) => {
      const current = await tx.transferMovement.findFirst({
        where: { id: movementId, type: "RECEPTION", status: "SOUMIS_CEIBAC" },
        select: { id: true, transferLotId: true, reference: true },
      });
      if (!current) throw new TransferRuleError("Ce constat n'attend plus la validation interne.");
      await tx.transferSignature.create({
        data: {
          movementId,
          party: "CEIBAC_VALIDATOR",
          signatoryName: parsed.data.signatoryName,
          signatoryTitle: parsed.data.signatoryTitle,
          signatureData: parsed.data.signature,
          capturedById: session.userId,
          signedAt: new Date(),
          ipAddress: ip,
        },
      });
      await tx.transferMovement.update({
        where: { id: movementId },
        data: { status: "VALIDE_CEIBAC", ceibacValidatedAt: new Date(), ceibacValidatedById: session.userId },
      });
      await tx.auditLog.create({
        data: { userId: session.userId, action: "TRANSFER_RECEPTION_CEIBAC_VALIDATE", entity: "TRANSFER_MOVEMENT", entityId: movementId, ipAddress: ip },
      });
      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath(`/transferts/${movement.transferLotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    await runAfterTransferCommit(async () => {
      const summary = await getTransferMovementNotificationSummary(movement.id);
      if (!summary) return;
      await notifyAfterTransferCommit({
        event: "MOVEMENT_CEIBA_VALIDATED",
        entityType: "TRANSFER_MOVEMENT",
        entityId: summary.id,
        recipientRoleCodes: ["VALIDATEUR_MINISTERE"],
        title: `Constat ${summary.reference} à contre-signer`,
        message: "Le constat de réception a reçu la validation interne. Le SDA doit effectuer le contrôle final et contre-signer le document.",
        reference: summary.reference,
        statusLabel: "En attente du visa final du ministère",
        actionPath: `/transferts/${summary.transferLot.id}`,
        actionLabel: "Contrôler la réception",
        documentPath: `/api/transferts/${summary.transferLot.id}/bordereaux/${summary.id}`,
        documentLabel: "Télécharger le constat F03",
        details: movementNotificationDetails(summary),
      });
    });
    return { success: true, message: `Le constat ${movement.reference} est validé en interne et transmis au SDA.` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    console.error("CEIBA reception approval failed.", error);
    return { error: "La validation interne n'a pas pu être enregistrée." };
  }
}

export async function approveTransferMovementByMinistry(
  movementId: number,
  _previous: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const session = await requirePermission("TRANSFER_AUTHORIZE");
  if (!Number.isInteger(movementId) || movementId <= 0) return { error: "Bordereau invalide." };
  const parsed = transferApprovalSchema.safeParse({
    ...await signataireConnecte(session.userId).then((signataire) => ({ signatoryName: signataire.name, signatoryTitle: signataire.title })),
    signature: formData.get("signature"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Visa invalide." };

  try {
    const ip = await getClientIp();
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.transferMovement.findFirst({
        where: { id: movementId, status: "VALIDE_CEIBAC" },
        include: {
          transferLot: true,
          items: { include: { transferLotItem: { include: { dossiers: { select: { dossierId: true } } } } } },
        },
      });
      if (!movement) throw new TransferRuleError("Ce bordereau n'attend plus le visa du ministère.");

      const flow = movement.type === "SORTIE"
        ? {
            before: "PREVU" as const,
            after: "SORTI" as const,
            expectedLocation: { siteId: movement.transferLot.sourceSiteId, entrepotId: movement.transferLot.sourceEntrepotId },
            nextLocation: { siteId: null, entrepotId: null },
            timestamp: { departedAt: movement.occurredAt },
            ancienStatut: `SITE_${movement.transferLot.sourceSiteId}`,
            nouveauStatut: "EN_TRANSIT",
          }
        : movement.type === "RECEPTION"
          ? {
              before: "SORTI" as const,
              after: "RECU" as const,
              expectedLocation: { siteId: null, entrepotId: null },
              nextLocation: { siteId: movement.transferLot.destinationSiteId, entrepotId: movement.transferLot.destinationEntrepotId },
              timestamp: { receivedAt: movement.occurredAt },
              ancienStatut: "EN_TRANSIT",
              nouveauStatut: `SITE_${movement.transferLot.destinationSiteId}`,
            }
          : {
              before: "RECU" as const,
              after: "RETOURNE" as const,
              expectedLocation: { siteId: movement.transferLot.destinationSiteId, entrepotId: movement.transferLot.destinationEntrepotId },
              nextLocation: { siteId: movement.transferLot.sourceSiteId, entrepotId: movement.transferLot.sourceEntrepotId },
              timestamp: { returnedAt: movement.occurredAt },
              ancienStatut: `SITE_${movement.transferLot.destinationSiteId}`,
              nouveauStatut: `SITE_${movement.transferLot.sourceSiteId}`,
            };

      if (movement.items.length === 0 || movement.items.some((entry) => entry.transferLotItem.status !== flow.before)) {
        throw new TransferRuleError("Le stock lié à ce bordereau a changé. Actualisez le lot avant de valider.");
      }

      const dossierIds = [...new Set(movement.items.flatMap((entry) => entry.transferLotItem.dossiers.map((link) => link.dossierId)))];
      const itemIds = movement.items.map((entry) => entry.transferLotItemId);
      const cartonIds = [...new Set(movement.items.flatMap((entry) => entry.transferLotItem.cartonId == null ? [] : [entry.transferLotItem.cartonId]))].sort((a, b) => a - b);
      if (cartonIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM cartons WHERE id IN (${Prisma.join(cartonIds)}) ORDER BY id FOR UPDATE`);
        const extraMembers = await tx.dossier.count({ where: { cartonId: { in: cartonIds }, id: { notIn: dossierIds } } });
        if (extraMembers > 0) throw new TransferRuleError("Le contenu d'un carton a changé depuis la création du manifeste. Faites vérifier le lot avant le mouvement.");
        await tx.carton.updateMany({ where: { id: { in: cartonIds } }, data: { legacyKey: null } });
      }
      const updatedDossiers = await tx.dossier.updateMany({
        where: { id: { in: dossierIds }, ...flow.expectedLocation },
        data: flow.nextLocation,
      });
      if (updatedDossiers.count !== dossierIds.length) {
        throw new TransferRuleError("L'emplacement d'un dossier a changé. Le bordereau ne peut pas être finalisé.");
      }
      const updatedItems = await tx.transferLotItem.updateMany({
        where: { id: { in: itemIds }, transferLotId: movement.transferLotId, status: flow.before },
        data: { status: flow.after, ...flow.timestamp },
      });
      if (updatedItems.count !== itemIds.length) throw new TransferRuleError("Le stock a changé pendant la validation.");
      // Réception ou retour finalisés : les conteneurs de transport de ces cartons sont vidés.
      if (flow.after === "RECU" || flow.after === "RETOURNE") await dechargerCartons(tx, cartonIds, movement.transferLotId, session.userId);

      await tx.transferSignature.create({
        data: {
          movementId,
          party: "MINISTERE",
          signatoryName: parsed.data.signatoryName,
          signatoryTitle: parsed.data.signatoryTitle,
          signatureData: parsed.data.signature,
          capturedById: session.userId,
          signedAt: new Date(),
          ipAddress: ip,
        },
      });
      await tx.dossierHistory.createMany({
        data: dossierIds.map((dossierId) => ({
          dossierId,
          userId: session.userId,
          action: `TRANSFER_${movement.type}`,
          ancienStatut: flow.ancienStatut,
          nouveauStatut: flow.nouveauStatut,
          commentaire: `Mouvement finalisé après les validations interne et SDA par le bordereau ${movement.reference}.`,
          metadata: {
            transferLotId: movement.transferLotId,
            transferMovementId: movement.id,
            movementReference: movement.reference,
            movementType: movement.type,
            fromSiteId: movement.fromSiteId,
            toSiteId: movement.toSiteId,
          },
        })),
      });

      const finalItems = await tx.transferLotItem.findMany({ where: { transferLotId: movement.transferLotId }, select: { status: true } });
      const nextStatus = deriveTransferLotStatus(
        finalItems.map((item) => item.status as TransferItemStatusCode),
        movement.transferLot.status as TransferLotStatusCode,
      ) as TransferLotStatus;
      await tx.transferLot.update({ where: { id: movement.transferLotId }, data: { status: nextStatus } });
      await tx.transferMovement.update({
        where: { id: movementId },
        data: { status: "VALIDE_MINISTERE", ministryValidatedAt: new Date(), ministryValidatedById: session.userId },
      });
      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: `TRANSFER_${movement.type}_MINISTRY_VALIDATE`,
          entity: "TRANSFER_MOVEMENT",
          entityId: movementId,
          newValue: { reference: movement.reference, dossierCount: dossierIds.length, status: nextStatus },
          ipAddress: ip,
        },
      });
      return { transferLotId: movement.transferLotId, reference: movement.reference, type: movement.type };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });

    revalidatePath(`/transferts/${result.transferLotId}`);
    revalidatePath("/transferts");
    revalidatePath("/transferts/validation");
    revalidatePath("/transferts/validation-ceibac");
    revalidatePath("/dossiers");
    revalidatePath("/dashboard/geographie");
    await runAfterTransferCommit(async () => {
      const movement = await getTransferMovementNotificationSummary(movementId);
      if (!movement) return;
      const documentCode = movement.type === "RECEPTION" ? "F03" : "F02";
      await notifyAfterTransferCommit({
        event: "MOVEMENT_SIGNED",
        entityType: "TRANSFER_MOVEMENT",
        entityId: movement.id,
        // Étape suivante : sortie signée → le convoyeur part ; retour signé → le site
        // qui récupère ses archives ; réception signée → le gestionnaire du lot.
        recipientRoleCodes: [],
        recipientUserIds: nextActor(
          movement.type === "SORTIE"
            ? await getLotConvoyeurIds(movement.transferLot.id)
            : movement.type === "RETOUR"
              ? await getSiteResponsibleUserIds([movement.toSiteId])
              : [movement.transferLot.createdById],
          [movement.transferLot.createdById],
        ),
        title: `Bordereau ${movement.reference} signé`,
        message: "Le visa final du ministère est enregistré. Le bordereau signé est disponible et le stock documentaire a été mis à jour.",
        reference: movement.reference,
        statusLabel: `Document ${documentCode} signé disponible`,
        actionPath: `/transferts/${movement.transferLot.id}`,
        actionLabel: "Consulter le transfert",
        documentPath: `/api/transferts/${movement.transferLot.id}/bordereaux/${movement.id}`,
        documentLabel: `Télécharger le bordereau ${documentCode}`,
        details: movementNotificationDetails(movement),
      });
    });
    const stockMessage = result.type === "SORTIE"
      ? "Le stock du site A est décrémenté et le lot passe en transit."
      : result.type === "RECEPTION"
        ? "Le stock du site B est mis à jour."
        : "Le stock du site A est réintégré.";
    return { success: true, message: `Le bordereau ${result.reference} est contre-signé. ${stockMessage}` };
  } catch (error) {
    if (error instanceof TransferRuleError) return { error: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Un autre agent vient de modifier ce stock. Actualisez puis réessayez." };
    }
    console.error("Ministry transfer approval failed.", error);
    return { error: "Le visa du ministère n'a pas pu être enregistré." };
  }
}
