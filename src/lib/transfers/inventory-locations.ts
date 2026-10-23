/** Physical cartons are counted at their current site and room, at every workflow stage. */
export function summarizeInventoryLocations(rows: Array<{
  siteId: number | null;
  entrepotId: number | null;
  codeBarres: string | null;
  libelleCarton: string | null;
  _count: { _all: number };
}>) {
  const locations = new Map<string, {
    siteId: number | null; entrepotId: number | null;
    dossiers: number; unidentifiedDossiers: number; cartons: Set<string>;
  }>();
  for (const row of rows) {
    const key = `${row.siteId}:${row.entrepotId}`;
    const location = locations.get(key) ?? {
      siteId: row.siteId, entrepotId: row.entrepotId,
      dossiers: 0, unidentifiedDossiers: 0, cartons: new Set<string>(),
    };
    location.dossiers += row._count._all;
    const identity = row.codeBarres?.trim() ? `code:${row.codeBarres.trim()}`
      : row.libelleCarton?.trim() ? `label:${row.libelleCarton.trim()}` : null;
    if (identity) location.cartons.add(identity);
    else location.unidentifiedDossiers += row._count._all;
    locations.set(key, location);
  }
  return [...locations.values()].map((location) => ({ ...location, cartons: location.cartons.size }));
}
