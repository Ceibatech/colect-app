import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { formatCartonReference, parseCartonReference } from "@/lib/cartons/reference";
import { normalizeCartonLabel, tidyCartonText } from "@/lib/cartons/identity-normalization";
import { cartonLabelKeySql } from "@/lib/cartons/persistence";
import { parseCote } from "@/lib/cartons/cote";

/**
 * Cartons et QR codes. Chaque carton physique porte la cote du référentiel
 * MULCV (2010-KOU-0001) ; le QR code imprimé encode l'adresse de sa fiche
 * (…/c/2010-KOU-0001), lisible par un téléphone ou une douchette. L'ancien
 * identifiant technique (CTN-00000123) reste reconnu.
 */

export const LABEL_PRINT_LIMIT = 400;
const PAGE_SIZE = 50;

export type CartonRow = {
  id: number;
  /** Cote du référentiel (2010-KOU-0001), ou l'identifiant CTN tant qu'elle n'est pas attribuée. */
  reference: string;
  ctn: string;
  cote: string | null;
  label: string | null;
  site: string | null;
  salle: string | null;
  dossiers: number;
};

type RawRow = { id: number; cote: string | null; label: string | null; site: string | null; salle: string | null; dossiers: bigint | number };

function toRow(row: RawRow): CartonRow {
  return {
    id: Number(row.id),
    reference: row.cote ?? formatCartonReference(Number(row.id)),
    ctn: formatCartonReference(Number(row.id)),
    cote: row.cote,
    label: tidyCartonText(row.label),
    site: row.site,
    salle: row.salle,
    dossiers: Number(row.dossiers),
  };
}

export type CartonFilters = { q?: string; siteId?: number; entrepotId?: number };

function filterSql({ q, siteId, entrepotId }: CartonFilters) {
  const clauses: Prisma.Sql[] = [];
  if (siteId) clauses.push(Prisma.sql`d.site_id = ${siteId}`);
  if (entrepotId) clauses.push(Prisma.sql`d.entrepot_id = ${entrepotId}`);
  const query = q?.trim();
  if (query) {
    const id = parseCartonReference(query) ?? (/^\d{1,10}$/.test(query) ? Number(query) : null);
    const key = normalizeCartonLabel(query);
    const options: Prisma.Sql[] = [];
    if (id) options.push(Prisma.sql`c.id = ${id}`);
    const cote = parseCote(query);
    options.push(cote ? Prisma.sql`c.cote = ${cote.carton}` : Prisma.sql`c.cote LIKE ${`%${query}%`}`);
    if (key) {
      options.push(Prisma.sql`CONVERT(${cartonLabelKeySql(Prisma.sql`d.libelle_carton`)} USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE CONVERT(${`%${key}%`} USING utf8mb4) COLLATE utf8mb4_unicode_ci`);
    }
    options.push(Prisma.sql`d.code_barres = ${query}`);
    clauses.push(Prisma.sql`c.id IN (SELECT c.id FROM cartons c JOIN dossiers d ON d.carton_id = c.id WHERE ${Prisma.join(options, " OR ")})`);
  }
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

/** Ordre des cotes : rubrique-commune, puis n° du carton ; cartons sans cote à la fin. */
const COTE_ORDER = Prisma.sql`c.cote_prefixe IS NULL, c.cote_prefixe, c.cote_sequence, c.id`;

function cartonSelect(where: Prisma.Sql, tail: Prisma.Sql) {
  // Libellé le plus fréquent parmi les dossiers du carton.
  return Prisma.sql`
    SELECT c.id, c.cote,
      (SELECT d2.libelle_carton FROM dossiers d2 WHERE d2.carton_id = c.id AND d2.libelle_carton IS NOT NULL AND TRIM(d2.libelle_carton) <> ''
        GROUP BY d2.libelle_carton ORDER BY COUNT(*) DESC, MIN(d2.id) LIMIT 1) AS label,
      MIN(s.nom) AS site, MIN(e.nom) AS salle, COUNT(d.id) AS dossiers
    FROM cartons c
    JOIN dossiers d ON d.carton_id = c.id
    LEFT JOIN sites s ON s.id = d.site_id
    LEFT JOIN entrepots e ON e.id = d.entrepot_id
    ${where}
    GROUP BY c.id, c.cote, c.cote_prefixe, c.cote_sequence
    ${tail}`;
}

export async function listCartons(filters: CartonFilters & { page?: number }) {
  const page = Math.max(1, filters.page ?? 1);
  const where = filterSql(filters);
  const [rows, [count]] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(cartonSelect(where, Prisma.sql`ORDER BY ${COTE_ORDER} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`)),
    prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      SELECT COUNT(*) AS total FROM (SELECT c.id FROM cartons c JOIN dossiers d ON d.carton_id = c.id ${where} GROUP BY c.id) x`),
  ]);
  const total = Number(count?.total ?? 0);
  return { rows: rows.map(toRow), page, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Cartons à étiqueter : une liste d'identifiants, ou tous ceux d'un filtre (plafonné). */
export async function getLabelCartons(input: CartonFilters & { ids?: number[] }) {
  const where = input.ids?.length
    ? Prisma.sql`WHERE c.id IN (${Prisma.join(input.ids.slice(0, LABEL_PRINT_LIMIT))})`
    : filterSql(input);
  const rows = await prisma.$queryRaw<RawRow[]>(cartonSelect(where, Prisma.sql`ORDER BY site, salle, ${COTE_ORDER} LIMIT ${LABEL_PRINT_LIMIT + 1}`));
  return { rows: rows.slice(0, LABEL_PRINT_LIMIT).map(toRow), truncated: rows.length > LABEL_PRINT_LIMIT };
}

export async function getCartonSheet(id: number) {
  const carton = await prisma.carton.findUnique({
    where: { id },
    select: {
      id: true,
      cote: true,
      createdAt: true,
      dossiers: {
        orderBy: [{ rangCarton: "asc" }, { id: "asc" }],
        select: {
          id: true, reference: true, cote: true, rangCarton: true, nom: true, prenoms: true, libelleCarton: true, codeBarres: true,
          statutPreparation: true, statutNumerisation: true, statutConditionnement: true, statutIndexation: true, statutArchivage: true,
          site: { select: { nom: true } },
          entrepot: { select: { nom: true, localisation: true } },
        },
      },
      transferLotItems: {
        orderBy: { id: "desc" },
        take: 5,
        select: { status: true, transferLot: { select: { id: true, reference: true, status: true } } },
      },
    },
  });
  if (!carton) return null;
  const counts = new Map<string, number>();
  for (const dossier of carton.dossiers) {
    const label = tidyCartonText(dossier.libelleCarton);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const labels = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  const first = carton.dossiers[0];
  return {
    ...carton,
    reference: carton.cote ?? formatCartonReference(carton.id),
    ctn: formatCartonReference(carton.id),
    label: labels[0] ?? null,
    labelVariants: labels.slice(1),
    site: first?.site?.nom ?? null,
    salle: first?.entrepot ? [first.entrepot.nom, first.entrepot.localisation].filter(Boolean).join(" · ") : null,
  };
}

/** Adresse publique de l'application, telle que vue par le navigateur (derrière le proxy). */
export async function getPublicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** Adresse encodée dans le QR : la cote du carton (ou son CTN tant qu'elle n'existe pas). */
export function cartonScanUrl(origin: string, reference: string) {
  return `${origin}/c/${encodeURIComponent(reference)}`;
}

/** Carton désigné dans une adresse : cote (2010-KOU-0001, ou celle d'un de ses dossiers) ou CTN. */
export async function resolveCartonRef(ref: string): Promise<number | null> {
  const text = decodeURIComponent(ref).trim().toUpperCase();
  const id = parseCartonReference(text);
  if (id) return id;
  const cote = parseCote(text);
  if (!cote) return null;
  const carton = await prisma.carton.findUnique({ where: { cote: cote.carton }, select: { id: true } });
  return carton?.id ?? null;
}

/** QR code SVG (correction d'erreur Q : reste lisible avec une étiquette un peu abîmée). */
export async function cartonQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#000000", light: "#ffffff" } });
}

export async function listCartonLocations() {
  const [sites, entrepots] = await Promise.all([
    prisma.site.findMany({ where: { isActive: true }, orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
    prisma.entrepot.findMany({ orderBy: { nom: "asc" }, select: { id: true, nom: true, siteId: true } }),
  ]);
  return { sites, entrepots };
}
