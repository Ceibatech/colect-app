import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { normalizeCartonIdentity } from "@/lib/cartons/identity-normalization";

export type CartonIntakeIdentity = {
  siteId?: number | null;
  entrepotId?: number | null;
  codeBarres?: string | null;
  libelleCarton?: string | null;
};

/**
 * Retire tout espacement (y compris insécable) d'une colonne. Doit rester
 * aligné avec `normalizeCartonCode` / `normalizeCartonLabel`.
 */
function stripSpacesSql(column: Prisma.Sql) {
  return Prisma.sql`REGEXP_REPLACE(COALESCE(${column}, ''), '(*UCP)[[:space:]]+', '')`;
}

/**
 * Clé d'admission concurrente (v3 : le libellé normalisé identifie le carton,
 * le code-barres seulement à défaut de libellé). Le préfixe de version évite
 * toute collision avec les clés précédentes.
 */
export function buildCartonLegacyKey(identity: CartonIntakeIdentity): string | null {
  const normalized = normalizeCartonIdentity(identity);
  if (!normalized) return null;
  const hex = Buffer.from(normalized.value, "utf8").toString("hex").toUpperCase();
  return createHash("sha256")
    .update(`v3:${identity.siteId ?? "~"}:${identity.entrepotId ?? "~"}:${normalized.kind}:${hex}`)
    .digest("hex");
}

async function matchingCartonIds(tx: Prisma.TransactionClient, identity: CartonIntakeIdentity) {
  const normalized = normalizeCartonIdentity(identity);
  if (!normalized) return [];
  const code = stripSpacesSql(Prisma.sql`d.code_barres`);
  const label = stripSpacesSql(Prisma.sql`d.libelle_carton`);
  // Code : comparaison binaire (casse significative). Libellé : la collation
  // unicode_ci absorbe casse et accents, comme normalizeCartonLabel.
  const identifyingClause = normalized.kind === "label"
    ? Prisma.sql`CONVERT(${label} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(${normalized.value} USING utf8mb4) COLLATE utf8mb4_unicode_ci`
    : Prisma.sql`${label} = '' AND BINARY ${code} = BINARY ${normalized.value}`;
  // Tant que d'anciens cartons de même libellé n'ont pas été regroupés, le plus
  // ancien CTN (celui que conserve le regroupement) reçoit les nouveaux dossiers.
  return tx.$queryRaw<Array<{ cartonId: number }>>(Prisma.sql`
    SELECT MIN(d.carton_id) AS cartonId FROM dossiers d
    WHERE d.carton_id IS NOT NULL
      AND d.site_id <=> ${identity.siteId ?? null}
      AND d.entrepot_id <=> ${identity.entrepotId ?? null}
      AND ${identifyingClause}
    HAVING MIN(d.carton_id) IS NOT NULL
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
