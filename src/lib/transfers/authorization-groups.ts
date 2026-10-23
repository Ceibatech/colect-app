export interface TransferAuthorizationGroupingRow {
  id: number;
  reference: string;
  status: string;
  plannedAt: Date | null;
  createdAt: Date;
  authorizedAt: Date | null;
  sourceSiteId: number;
  sourceEntrepotId: number | null;
  destinationSiteId: number;
  destinationEntrepotId: number | null;
  source: string;
  destination: string;
  cartonCount: number;
  dossierCount: number;
}

export interface TransferAuthorizationGroup<T extends TransferAuthorizationGroupingRow> {
  key: string;
  plannedDate: string;
  plannedAt: Date;
  sourceSiteId: number;
  sourceEntrepotId: number | null;
  destinationSiteId: number;
  destinationEntrepotId: number | null;
  source: string;
  destination: string;
  rows: T[];
  references: string[];
  lotCount: number;
  cartonCount: number;
  dossierCount: number;
  fullyAuthorized: boolean;
  legacyUnplanned: boolean;
}

export function groupTransferAuthorizationRows<T extends TransferAuthorizationGroupingRow>(rows: T[]) {
  const groups = new Map<string, TransferAuthorizationGroup<T>>();

  for (const row of rows) {
    if (row.status === "ANNULE") continue;
    const date = row.plannedAt ?? row.createdAt;
    const plannedDate = toDateKey(date);
    // Legacy lots without a planned date stay isolated. New operations are
    // grouped by transfer date and exact itinerary.
    const routeKey = row.plannedAt
      ? [plannedDate, row.sourceSiteId, nullableKey(row.sourceEntrepotId), row.destinationSiteId, nullableKey(row.destinationEntrepotId)].join(":")
      : `legacy:${row.id}`;
    const existing = groups.get(routeKey);

    if (existing) {
      existing.rows.push(row);
      existing.references.push(row.reference);
      existing.lotCount += 1;
      existing.cartonCount += row.cartonCount;
      existing.dossierCount += row.dossierCount;
      existing.fullyAuthorized = existing.fullyAuthorized && Boolean(row.authorizedAt);
      continue;
    }

    groups.set(routeKey, {
      key: routeKey,
      plannedDate,
      plannedAt: date,
      sourceSiteId: row.sourceSiteId,
      sourceEntrepotId: row.sourceEntrepotId,
      destinationSiteId: row.destinationSiteId,
      destinationEntrepotId: row.destinationEntrepotId,
      source: row.source,
      destination: row.destination,
      rows: [row],
      references: [row.reference],
      lotCount: 1,
      cartonCount: row.cartonCount,
      dossierCount: row.dossierCount,
      fullyAuthorized: Boolean(row.authorizedAt),
      legacyUnplanned: !row.plannedAt,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => a.reference.localeCompare(b.reference, "fr")),
      references: group.references.sort((a, b) => a.localeCompare(b, "fr")),
    }))
    .sort((a, b) => b.plannedAt.getTime() - a.plannedAt.getTime());
}

export function getTransferAuthorizationGroupDownloadHref(group: TransferAuthorizationGroup<TransferAuthorizationGroupingRow>) {
  if (group.legacyUnplanned) return `/api/transferts/${group.rows[0].id}/autorisation`;
  const params = new URLSearchParams({
    date: group.plannedDate,
    sourceSiteId: String(group.sourceSiteId),
    sourceEntrepotId: nullableKey(group.sourceEntrepotId),
    destinationSiteId: String(group.destinationSiteId),
    destinationEntrepotId: nullableKey(group.destinationEntrepotId),
  });
  return `/api/transferts/autorisations?${params.toString()}`;
}

export function toDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function nullableKey(value: number | null) {
  return value === null ? "none" : String(value);
}
