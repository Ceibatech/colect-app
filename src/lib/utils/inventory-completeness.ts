import { computeRate } from "@/lib/utils/rate";

export const INVENTORY_COMPLETENESS_FIELDS = [
  { key: "commune", label: "Commune" },
  { key: "lotissement", label: "Lotissement" },
  { key: "libelleCarton", label: "Libellé du carton" },
  { key: "referenceClassement", label: "Référence de classement" },
  { key: "numeroLot", label: "Numéro de lot" },
  { key: "natureDossier", label: "Nature du dossier" },
  { key: "numeroIlot", label: "Numéro d’îlot" },
  { key: "titreFoncier", label: "Titre foncier" },
  { key: "superficie", label: "Superficie" },
  { key: "numeroDdu", label: "Numéro DDU / Direction-service" },
  { key: "codeBarres", label: "Code-barres" },
  { key: "numeroGuichet", label: "Numéro guichet" },
] as const;

export type InventoryCompletenessKey = (typeof INVENTORY_COMPLETENESS_FIELDS)[number]["key"];
export type InventoryCompletenessCounts = Record<InventoryCompletenessKey, number>;

export interface InventoryCompletenessMetric {
  key: InventoryCompletenessKey;
  label: string;
  filled: number;
  missing: number;
  total: number;
  rate: number;
}

export function buildInventoryCompletenessMetrics(
  total: number,
  counts: InventoryCompletenessCounts,
): InventoryCompletenessMetric[] {
  const safeTotal = Math.max(0, total);

  return INVENTORY_COMPLETENESS_FIELDS.map(({ key, label }) => {
    const filled = Math.max(0, Math.min(counts[key], safeTotal));
    return {
      key,
      label,
      filled,
      missing: safeTotal - filled,
      total: safeTotal,
      rate: computeRate(filled, safeTotal),
    };
  });
}
