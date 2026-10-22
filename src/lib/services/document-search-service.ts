import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getOperateurScopeFilter } from "@/lib/services/access-scope";

export interface DocumentSearchInput {
  query?: string;
  fieldKey?: string;
  page?: number;
  pageSize?: number;
}

function booleanSearchQuery(query: string): string {
  return query
    .normalize("NFKC")
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((token) => token.length >= 2)
    .slice(0, 10)
    .map((token) => `+${token}*`)
    .join(" ");
}

function buildSnippet(searchText: string | null, query: string): string | null {
  if (!searchText || !query) return null;
  const normalized = searchText.toLocaleLowerCase("fr");
  const terms = query.toLocaleLowerCase("fr").split(/\s+/).filter(Boolean);
  const firstIndex = terms.reduce((best, term) => {
    const index = normalized.indexOf(term);
    return index >= 0 && (best < 0 || index < best) ? index : best;
  }, -1);
  if (firstIndex < 0) return searchText.slice(0, 220).replace(/\s+/g, " ").trim();
  const start = Math.max(0, firstIndex - 80);
  const end = Math.min(searchText.length, firstIndex + 180);
  return `${start > 0 ? "…" : ""}${searchText.slice(start, end).replace(/\s+/g, " ").trim()}${end < searchText.length ? "…" : ""}`;
}

export async function searchIndexedDocuments(input: DocumentSearchInput) {
  const session = await requirePermission("DOSSIER_READ");
  const query = input.query?.trim().slice(0, 120) ?? "";
  const fieldKey = input.fieldKey?.trim().slice(0, 80) || undefined;
  const pageSize = Math.min(50, Math.max(10, input.pageSize ?? 20));
  const page = Math.max(1, input.page ?? 1);
  const operateurScope = await getOperateurScopeFilter(session);
  const booleanQuery = booleanSearchQuery(query);
  let rankedIds: number[] = [];
  const scores = new Map<number, number>();

  if (booleanQuery) {
    try {
      const rows = await prisma.$queryRaw<Array<{ id: number; score: number }>>(Prisma.sql`
        SELECT id, MATCH(search_text) AGAINST (${booleanQuery} IN BOOLEAN MODE) AS score
        FROM documents
        WHERE automatic_index_status = 'INDEXE'
          AND MATCH(search_text) AGAINST (${booleanQuery} IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT 500
      `);
      rankedIds = rows.map((row) => row.id);
      rows.forEach((row) => scores.set(row.id, Number(row.score)));
    } catch {
      // La migration peut être en cours sur un environnement secondaire :
      // le filtre LIKE ci-dessous maintient une recherche fonctionnelle.
    }
  }

  const where: Prisma.DocumentWhereInput = {
    automaticIndexStatus: "INDEXE",
    preIndexStatus: "PRET",
    dossier: operateurScope === undefined ? undefined : { operateurId: operateurScope },
    ...(fieldKey
      ? { indexValues: { some: { field: { key: fieldKey, isActive: true }, ...(query ? { value: { contains: query } } : {}) } } }
      : {}),
  };
  if (query) {
    where.AND = [
      rankedIds.length > 0
        ? { id: { in: rankedIds } }
        : {
            OR: [
              { searchText: { contains: query } },
              { titreIndexation: { contains: query } },
              { referenceIndexation: { contains: query } },
              { nomOriginal: { contains: query } },
            ],
          },
    ];
  }

  const documents = await prisma.document.findMany({
    where,
    select: {
      id: true,
      dossierId: true,
      nomOriginal: true,
      titreIndexation: true,
      referenceIndexation: true,
      dateDocument: true,
      nombrePages: true,
      classificationPath: true,
      indexingConfidence: true,
      searchText: true,
      createdAt: true,
      typePiece: { select: { libelle: true } },
      dossier: {
        select: {
          reference: true,
          nom: true,
          prenoms: true,
          commune: { select: { nom: true } },
          site: { select: { nom: true } },
        },
      },
      indexValues: {
        where: { field: { isActive: true, isSearchable: true } },
        orderBy: { field: { sortOrder: "asc" } },
        select: { value: true, field: { select: { label: true, key: true } } },
      },
    },
    take: rankedIds.length > 0 ? 500 : pageSize,
    skip: rankedIds.length > 0 ? 0 : (page - 1) * pageSize,
    orderBy: rankedIds.length > 0 ? undefined : { indexedAt: "desc" },
  });

  const ordered = rankedIds.length > 0
    ? [...documents].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    : documents;
  const paged = rankedIds.length > 0 ? ordered.slice((page - 1) * pageSize, page * pageSize) : ordered;
  const total = rankedIds.length > 0 ? ordered.length : await prisma.document.count({ where });

  return {
    items: paged.map(({ searchText, indexingConfidence, ...document }) => ({
      ...document,
      indexingConfidence: indexingConfidence ? Number(indexingConfidence) : null,
      snippet: buildSnippet(searchText, query),
      relevance: scores.get(document.id) ?? null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
