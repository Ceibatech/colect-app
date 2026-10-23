import { buildCartonToken } from "@/lib/workflow/carton-identity";

export const MAX_TRANSFER_CARTONS = 200;

export interface TransferCartonSourceRow {
  id: number;
  siteId: number | null;
  codeBarres: string | null;
  libelleCarton: string | null;
  transferLotDossiers: Array<{ id: number }>;
}

export interface TransferCartonItem {
  token: string;
  code: string;
  label: string | null;
  dossierCount: number;
  unlocatedDossierCount: number;
}

export function buildTransferCartonToken(row: Pick<TransferCartonSourceRow, "codeBarres" | "libelleCarton">) {
  return buildCartonToken({
    siteId: undefined,
    codeBarres: row.codeBarres,
    libelleCarton: row.libelleCarton,
  });
}

export function groupAvailableTransferCartons(rows: TransferCartonSourceRow[]) {
  const grouped = new Map<string, TransferCartonItem & { hasConflict: boolean }>();
  let unidentifiedDossierCount = 0;

  for (const row of rows) {
    const token = buildTransferCartonToken(row);
    if (!token) {
      unidentifiedDossierCount++;
      continue;
    }

    const code = row.codeBarres?.trim() || row.libelleCarton?.trim();
    if (!code) {
      unidentifiedDossierCount++;
      continue;
    }

    const current = grouped.get(token) ?? {
      token,
      code,
      label: row.codeBarres?.trim() ? row.libelleCarton?.trim() || null : null,
      dossierCount: 0,
      unlocatedDossierCount: 0,
      hasConflict: false,
    };
    current.dossierCount++;
    if (row.siteId === null) current.unlocatedDossierCount++;
    if (row.transferLotDossiers.length > 0) current.hasConflict = true;
    if (!current.label && row.codeBarres?.trim() && row.libelleCarton?.trim()) {
      current.label = row.libelleCarton.trim();
    }
    grouped.set(token, current);
  }

  const items = [...grouped.values()]
    .filter((item) => !item.hasConflict)
    .map((item) => ({
      token: item.token,
      code: item.code,
      label: item.label,
      dossierCount: item.dossierCount,
      unlocatedDossierCount: item.unlocatedDossierCount,
    }))
    .sort((left, right) => left.code.localeCompare(right.code, "fr", { numeric: true, sensitivity: "base" }));

  return { items, unidentifiedDossierCount, engagedCartonCount: [...grouped.values()].filter((item) => item.hasConflict).length };
}

export function filterTransferCartons(items: TransferCartonItem[], query?: string) {
  const normalizedQuery = normalizeSearch(query ?? "");
  if (!normalizedQuery) return items;
  return items.filter((item) => normalizeSearch(`${item.code} ${item.label ?? ""}`).includes(normalizedQuery));
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}
