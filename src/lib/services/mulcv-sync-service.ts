import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { buildPayloads, type CaisseContent, type MulcvPayload } from "@/lib/mulcv/conteneur";

/**
 * Envoi automatique à MULCV des caisses reçues chez CEIBA.
 *
 * À la réception d'une prise en charge (F03 contre-signée), chaque caisse du bordereau
 * devient un conteneur MULCV avec ses cartons et ses dossiers, sous leurs cotes. L'envoi
 * passe par une file d'attente (mulcv_deliveries) : la réception n'attend jamais MULCV, un
 * échec temporaire est retenté par l'ordonnanceur, et MULCV traite un renvoi sans doublon.
 */

const MAX_ATTEMPTS = 12;
const BATCH = 20;

type Db = Prisma.TransactionClient | typeof prisma;

export type MulcvConfig = { apiBase: string; tokenUrl: string; clientId: string; clientSecret: string; zone: string };

export function mulcvConfig(): MulcvConfig | null {
  const apiBase = process.env.MULCV_API_BASE?.trim().replace(/\/+$/, "");
  const tokenUrl = process.env.MULCV_TOKEN_URL?.trim();
  const clientSecret = process.env.MULCV_CLIENT_SECRET?.trim();
  if (!apiBase || !tokenUrl || !clientSecret) return null;
  return {
    apiBase,
    tokenUrl,
    clientSecret,
    clientId: process.env.MULCV_CLIENT_ID?.trim() || "geoarchiv",
    zone: process.env.MULCV_ZONE?.trim() || "Zone_Sud",
  };
}

async function contents(db: Db, cartonIds: number[], caisseOf: (carton: { id: number; caisse: { numero: string } | null }) => string | null) {
  if (cartonIds.length === 0) return [];
  const cartons = await db.carton.findMany({
    where: { id: { in: cartonIds } },
    select: { id: true, cote: true, caisse: { select: { numero: true } }, dossiers: { select: { cote: true } } },
  });
  const byCaisse = new Map<string | null, CaisseContent>();
  for (const carton of cartons) {
    const numero = caisseOf(carton);
    const group = byCaisse.get(numero) ?? { caisseNumero: numero, cartons: [] };
    group.cartons.push({ cote: carton.cote, dossiers: carton.dossiers });
    byCaisse.set(numero, group);
  }
  return [...byCaisse.values()];
}

async function enqueue(db: Db, transferLotId: number, movementId: number | null, keyPrefix: string, lotReference: string, caisses: CaisseContent[]) {
  const zone = mulcvConfig()?.zone ?? "Zone_Sud";
  const { payloads, skippedCartons, skippedDossiers } = buildPayloads(lotReference, zone, caisses);
  if (payloads.length === 0) return { queued: 0, skippedCartons, skippedDossiers };
  const created = await db.mulcvDelivery.createMany({
    skipDuplicates: true,
    data: payloads.map((payload, index) => ({
      transferLotId,
      movementId,
      conteneurId: payload.conteneurId,
      idempotencyKey: `${keyPrefix}:${payload.conteneurId}:${index}`,
      payload: payload as unknown as Prisma.InputJsonValue,
      cartonCount: payload.cartons.length,
      dossierCount: payload.cartons.reduce((sum, carton) => sum + carton.dossiers.length, 0),
    })),
  });
  return { queued: created.count, skippedCartons, skippedDossiers };
}

/**
 * À appeler dans la transaction de réception, avant que les caisses soient vidées : les
 * cartons sont encore rattachés à leur caisse. Seules les réceptions sur un site CEIBA
 * (prise en charge) sont envoyées.
 */
export async function enqueueMulcvReception(tx: Prisma.TransactionClient, input: {
  transferLotId: number; lotReference: string; movementId: number; destinationSiteId: number; cartonIds: number[];
}) {
  const site = await tx.site.findUnique({ where: { id: input.destinationSiteId }, select: { organisation: true } });
  if (site?.organisation !== "CEIBA") return { queued: 0, skippedCartons: 0, skippedDossiers: 0 };
  const caisses = await contents(tx, input.cartonIds, (carton) => carton.caisse?.numero ?? null);
  return enqueue(tx, input.transferLotId, input.movementId, `reception:${input.movementId}`, input.lotReference, caisses);
}

/**
 * Rattrapage des réceptions déjà faites avant la mise en service : la caisse de chaque carton
 * est retrouvée dans l'historique (déchargement du lot). Sans effet sur ce qui est déjà en file.
 */
export async function backfillMulcvReceptions() {
  const lots = await prisma.transferLot.findMany({
    where: { destinationSite: { organisation: "CEIBA" }, items: { some: { status: { in: ["RECU", "RETOURNE"] }, cartonId: { not: null } } } },
    select: { id: true, reference: true, items: { where: { status: { in: ["RECU", "RETOURNE"] }, cartonId: { not: null } }, select: { cartonId: true } } },
    orderBy: { id: "asc" },
  });
  const result = { lots: lots.length, queued: 0, skippedCartons: 0, skippedDossiers: 0 };
  for (const lot of lots) {
    const cartonIds = lot.items.map((item) => item.cartonId!) ;
    const unloaded = await prisma.caisseMouvement.findMany({
      where: { transferLotId: lot.id, type: "DECHARGEMENT", cartonId: { in: cartonIds } },
      select: { cartonId: true, caisse: { select: { numero: true } } },
      orderBy: { createdAt: "asc" },
    });
    const caisseByCarton = new Map(unloaded.map((entry) => [entry.cartonId, entry.caisse.numero]));
    const caisses = await contents(prisma, cartonIds, (carton) => caisseByCarton.get(carton.id) ?? null);
    const queued = await enqueue(prisma, lot.id, null, `rattrapage:${lot.id}`, lot.reference, caisses);
    result.queued += queued.queued;
    result.skippedCartons += queued.skippedCartons;
    result.skippedDossiers += queued.skippedDossiers;
  }
  return result;
}

async function accessToken(config: MulcvConfig) {
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Authentification MULCV refusée (HTTP ${response.status}).`);
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("Authentification MULCV : jeton absent.");
  return body.access_token;
}

function retryAt(now: Date, attempt: number) {
  const minutes = Math.min(360, 2 ** Math.max(0, attempt - 1));
  return new Date(now.getTime() + minutes * 60_000);
}

export async function processPendingMulcvDeliveries(now = new Date()) {
  const config = mulcvConfig();
  if (!config) return { configured: false, due: 0, sent: 0, failed: 0 };
  const due = await prisma.mulcvDelivery.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, attemptCount: { lt: MAX_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: BATCH,
  });
  const result = { configured: true, due: due.length, sent: 0, failed: 0 };
  if (due.length === 0) return result;

  let token: string;
  try {
    token = await accessToken(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentification MULCV impossible.";
    await prisma.mulcvDelivery.updateMany({
      where: { id: { in: due.map((delivery) => delivery.id) } },
      data: { status: "FAILED", lastAttemptAt: now, errorMessage: message, nextAttemptAt: retryAt(now, 1) },
    });
    result.failed = due.length;
    return result;
  }

  for (const delivery of due) {
    const attempt = delivery.attemptCount + 1;
    const payload = { ...(delivery.payload as unknown as MulcvPayload), zone: config.zone };
    try {
      const response = await fetch(`${config.apiBase}/intake/geoarchiv/conteneurs`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.json().catch(() => ({})) as { path?: unknown; message?: unknown };
      if (response.ok) {
        await prisma.mulcvDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", attemptCount: attempt, lastAttemptAt: now, sentAt: now, nextAttemptAt: null, errorMessage: null,
            mulcvPath: typeof body.path === "string" ? body.path.slice(0, 255) : null },
        });
        result.sent++;
        continue;
      }
      const reason = `MULCV a refusé l'envoi (HTTP ${response.status})${typeof body.message === "string" && body.message ? ` : ${body.message}` : ""}`;
      // 4xx (hors 401/408/429) : refus définitif, à corriger à la main ; sinon nouvel essai.
      const permanent = response.status >= 400 && response.status < 500 && ![401, 408, 429].includes(response.status);
      await prisma.mulcvDelivery.update({
        where: { id: delivery.id },
        data: { status: permanent ? "REJECTED" : "FAILED", attemptCount: attempt, lastAttemptAt: now, errorMessage: reason.slice(0, 2000),
          nextAttemptAt: permanent ? null : retryAt(now, attempt) },
      });
      result.failed++;
    } catch (error) {
      await prisma.mulcvDelivery.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attemptCount: attempt, lastAttemptAt: now, nextAttemptAt: retryAt(now, attempt),
          errorMessage: error instanceof Error ? `MULCV injoignable : ${error.message}`.slice(0, 2000) : "MULCV injoignable." },
      });
      result.failed++;
    }
  }
  return result;
}
