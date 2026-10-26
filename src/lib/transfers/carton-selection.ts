import { buildCartonToken, getCartonDisplay } from "@/lib/workflow/carton-identity";
import { formatCartonReference, parseCartonReference } from "@/lib/cartons/reference";

export const MAX_TRANSFER_CARTONS = 200;

export interface TransferCartonSourceRow {
  id: number;
  cartonId?: number | null;
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
  /** Anciens codes-barres des dossiers : recherchables, mais pas affichés comme identité du carton. */
  codes?: string[];
}

export function buildTransferCartonToken(row: Pick<TransferCartonSourceRow, "cartonId" | "codeBarres" | "libelleCarton">) {
  return buildCartonToken({
    cartonId: row.cartonId,
    siteId: undefined,
    codeBarres: row.codeBarres,
    libelleCarton: row.libelleCarton,
  });
}

export function groupAvailableTransferCartons(rows: TransferCartonSourceRow[]) {
  const grouped = new Map<string, TransferCartonItem & { hasConflict: boolean; labels: Set<string>; codeSet: Set<string> }>();
  let unidentifiedDossierCount = 0;

  for (const row of rows) {
    const token = buildTransferCartonToken(row);
    if (!token) {
      unidentifiedDossierCount++;
      continue;
    }

    const display = getCartonDisplay(row);
    const code = display.label;

    const current = grouped.get(token) ?? {
      token,
      code,
      label: display.description,
      dossierCount: 0,
      unlocatedDossierCount: 0,
      hasConflict: false,
      labels: new Set<string>(),
      codeSet: new Set<string>(),
    };
    current.dossierCount++;
    if (row.siteId === null) current.unlocatedDossierCount++;
    if (row.transferLotDossiers.length > 0) current.hasConflict = true;
    if (display.description) current.labels.add(display.description);
    if (row.codeBarres?.trim()) current.codeSet.add(row.codeBarres.trim());
    grouped.set(token, current);
  }

  const items = [...grouped.values()]
    .filter((item) => !item.hasConflict)
    .map((item) => ({
      token: item.token,
      code: item.code,
      label: [...item.labels].join(" · ") || null,
      dossierCount: item.dossierCount,
      unlocatedDossierCount: item.unlocatedDossierCount,
      codes: [...item.codeSet],
    }))
    .sort((left, right) => left.code.localeCompare(right.code, "fr", { numeric: true, sensitivity: "base" }));

  return { items, unidentifiedDossierCount, engagedCartonCount: [...grouped.values()].filter((item) => item.hasConflict).length };
}

export function filterTransferCartons(items: TransferCartonItem[], query?: string) {
  const cartonId = parseCartonReference(query ?? "");
  if (cartonId !== null) return items.filter((item) => item.code === formatCartonReference(cartonId));
  const normalizedQuery = normalizeSearch(query ?? "");
  if (!normalizedQuery) return items;
  return items.filter((item) => normalizeSearch(`${item.code} ${item.label ?? ""} ${(item.codes ?? []).join(" ")}`).includes(normalizedQuery));
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr");
}
