import type { DossierFormValues } from "@/lib/validation/dossier";

export const CARTON_FIELD_KEYS = [
  "siteId",
  "entrepotId",
  "operateurId",
  "libelleCarton",
  "codeBarres",
  "numeroGuichet",
  "numeroDdu",
  "numeroDirectionService",
  "referenceClassement",
  "etatCarton",
  "etatCartonDescription",
] as const satisfies ReadonlyArray<keyof DossierFormValues>;

export type ActiveCartonValues = Partial<
  Pick<DossierFormValues, (typeof CARTON_FIELD_KEYS)[number]>
>;

export function extractActiveCartonValues(values: DossierFormValues): ActiveCartonValues {
  return Object.fromEntries(
    CARTON_FIELD_KEYS.flatMap((key) => {
      const value = values[key];
      return value === undefined || value === "" ? [] : [[key, value]];
    })
  ) as ActiveCartonValues;
}

export function hasActiveCartonIdentity(values: ActiveCartonValues): boolean {
  return Boolean(values.codeBarres?.trim() || values.libelleCarton?.trim());
}

export function getActiveCartonLabel(values: ActiveCartonValues): string {
  return values.libelleCarton?.trim() || values.codeBarres?.trim() || "Carton en cours";
}
