import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

export type CartonIntakeIdentity = {
  siteId?: number | null;
  entrepotId?: number | null;
  codeBarres?: string | null;
  libelleCarton?: string | null;
};

function normalizedIdentity(identity: CartonIntakeIdentity) {
  const barcode = identity.codeBarres?.trim();
  const label = identity.libelleCarton?.trim();
  return barcode ? { kind: "code", value: barcode } : label ? { kind: "label", value: label } : null;
}

/** Même encodage que la migration SQL, sans ambiguïté de séparateurs/collation. */
export function buildCartonLegacyKey(identity: CartonIntakeIdentity): string | null {
  const normalized = normalizedIdentity(identity);
  if (!normalized) return null;
  const hex = Buffer.from(normalized.value, "utf8").toString("hex").toUpperCase();
  return createHash("sha256")
    .update(`${identity.siteId ?? "~"}:${identity.entrepotId ?? "~"}:${normalized.kind}:${hex}`)
    .digest("hex");
}

async function matchingCartonIds(tx: Prisma.TransactionClient, identity: CartonIntakeIdentity) {
  const normalized = normalizedIdentity(identity);
  if (!normalized) return [];
  const identifyingClause = normalized.kind === "code"
    ? Prisma.sql`BINARY TRIM(d.code_barres) = BINARY ${normalized.value}`
    : Prisma.sql`NULLIF(TRIM(d.code_barres), '') IS NULL AND BINARY TRIM(d.libelle_carton) = BINARY ${normalized.value}`;
  return tx.$queryRaw<Array<{ cartonId: number }>>(Prisma.sql`
    SELECT DISTINCT d.carton_id AS cartonId FROM dossiers d
    WHERE d.carton_id IS NOT NULL
      AND d.site_id <=> ${identity.siteId ?? null}
      AND d.entrepot_id <=> ${identity.entrepotId ?? null}
      AND ${identifyingClause}
    LIMIT 2
  `);
}

async function assertOpenCarton(tx: Prisma.TransactionClient, cartonId: number) {
  const reservation = await tx.transferLotItem.findFirst({
    where: {
      cartonId,
      status: { in: ["PREVU", "SORTI", "RECU"] },
      transferLot: { status: { notIn: ["CLOTURE", "ANNULE"] } },
    },
    select: { id: true },
  });
  if (reservation) {
    throw new Error("Ce carton est engagé dans un transfert ouvert. Son contenu est figé ; terminez ou annulez ce transfert avant d'ajouter un dossier.");
  }
}

/**
 * À appeler dans la transaction qui écrit le dossier. La ligne carton est
 * verrouillée jusqu'au commit pour sérialiser l'admission et la réservation.
 * Utiliser READ COMMITTED ou SERIALIZABLE pour relire les réservations après
 * acquisition du verrou, sans conserver un instantané REPEATABLE READ périmé.
 * Une correction de brouillon conserve toujours son identité déjà attribuée.
 */
export async function resolveCartonId(
  tx: Prisma.TransactionClient,
  identity: CartonIntakeIdentity,
  existing?: CartonIntakeIdentity & { id: number; cartonId: number | null },
): Promise<number | null> {
  const legacyKey = buildCartonLegacyKey(identity);
  if (existing?.cartonId != null) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM cartons WHERE id = ${existing.cartonId} FOR UPDATE`);
    const locationChanged = (existing.siteId ?? null) !== (identity.siteId ?? null)
      || (existing.entrepotId ?? null) !== (identity.entrepotId ?? null);
    if (locationChanged && await tx.dossier.count({ where: { cartonId: existing.cartonId, id: { not: existing.id } } }) > 0) {
      throw new Error("Ce carton contient d'autres dossiers. Utilisez le transfert pour déplacer le carton complet sans séparer son contenu.");
    }
    if (buildCartonLegacyKey(existing) !== legacyKey) {
      await assertOpenCarton(tx, existing.cartonId);
      await tx.carton.update({ where: { id: existing.cartonId }, data: { legacyKey: null } });
    }
    return existing.cartonId;
  }
  if (!legacyKey) return null;

  // Rechercher d'abord les membres réellement présents : une ancienne clé
  // d'admission n'est jamais une preuve de présence après un mouvement.
  const candidates = await matchingCartonIds(tx, identity);
  if (candidates.length > 1) {
    throw new Error("Plusieurs cartons portent cette ancienne identification à cet emplacement. Utilisez une identification distincte avant d'ajouter un dossier.");
  }
  let cartonId: number;
  if (candidates.length === 1) {
    cartonId = candidates[0].cartonId;
    await tx.$queryRaw(Prisma.sql`SELECT id FROM cartons WHERE id = ${cartonId} FOR UPDATE`);
    const current = await matchingCartonIds(tx, identity);
    if (current.length !== 1 || current[0].cartonId !== cartonId) {
      throw new Error("L'emplacement du carton vient de changer. Rechargez la fiche avant de l'enregistrer.");
    }
  } else {
    // L'UPSERT natif garantit une seule identité même lors de deux saisies
    // simultanées ; un find/create applicatif laisserait une fenêtre de course.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO cartons (legacy_key, created_at, updated_at)
      VALUES (${legacyKey}, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE id = id
    `);
    const carton = await tx.carton.findUnique({ where: { legacyKey }, select: { id: true } });
    if (!carton) throw new Error("Impossible d'attribuer l'identifiant du carton.");
    cartonId = carton.id;
  }
  await assertOpenCarton(tx, cartonId);
  return cartonId;
}
