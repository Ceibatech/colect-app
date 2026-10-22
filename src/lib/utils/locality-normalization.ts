/**
 * Normalisation métier des localités ivoiriennes rencontrées dans les
 * inventaires historiques. Les clés sont volontairement sans accents ni
 * ponctuation afin d'absorber la casse, les espaces et les variantes OCR.
 */
export function localityMatchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

interface LotissementRule {
  canonicalName: string;
  communeName: string;
  aliases: readonly string[];
}

const LOTISSEMENT_RULES: readonly LotissementRule[] = [
  {
    canonicalName: "ZONE 4/C",
    communeName: "Marcory",
    aliases: [
      "ZONE 4/C",
      "ZONE 4 / C",
      "ZONE 4 /C",
      "ZONE4/C",
      "ZONE 4 C",
      "1ZONE 4/C",
      "ZONE 4/C COMPLEMENTAIRE",
      "ZONE 4/C COMPLÉMENTAIRE",
      "ZONE 4 C COMPLEMENTAIRE",
      "ZONE 4/C COMPLEMENT",
    ],
  },
  {
    canonicalName: "ZONE 4/C TYPE I",
    communeName: "Marcory",
    aliases: ["ZONE 4/C TYPE I", "ZONE 4 /C TYPE I", "ZONE 4 C TYPE I", "ZONE4/C TYPE I"],
  },
  {
    canonicalName: "ZONE 3",
    communeName: "Marcory",
    aliases: ["ZONE 3", "ZONE 3 MARCORY", "MARCORY ZONE 3"],
  },
  {
    canonicalName: "REMBLAIS",
    communeName: "Marcory",
    aliases: ["REMBLAI", "REMBLAIS", "MARCORY REMBLAI", "MARCORY REMBLAIS"],
  },
] as const;

const RULE_BY_ALIAS = new Map(
  LOTISSEMENT_RULES.flatMap((rule) => rule.aliases.map((alias) => [localityMatchKey(alias), rule] as const)),
);

/** Retourne le libellé de référence sans inventer une nouvelle localité. */
export function canonicalizeLotissementLabel(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const key = localityMatchKey(trimmed);
  const exactRule = RULE_BY_ALIAS.get(key);
  if (exactRule) return exactRule.canonicalName;
  if (/^ZONE 4 ?C COMPLEMENT/.test(key)) return "ZONE 4/C";
  return trimmed.toLocaleUpperCase("fr-FR");
}

/** Commune imposée par le vocabulaire métier, si la règle est connue. */
export function expectedCommuneForLotissement(value: string): string | null {
  const key = localityMatchKey(value);
  if (/^ZONE 4 ?C COMPLEMENT/.test(key)) return "Marcory";
  return RULE_BY_ALIAS.get(key)?.communeName ?? null;
}

/**
 * Harmonise les principales variantes observées lors des reprises de données.
 * Une valeur inconnue reste inchangée et devra correspondre au référentiel.
 */
export function canonicalizeCommuneLabel(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const key = localityMatchKey(trimmed);

  if (
    key === "MARCORY" ||
    key === "REMBLAI" ||
    key === "REMBLAIS" ||
    key === "MARCORY REMBLAI" ||
    key === "MARCORY REMBLAIS" ||
    key.startsWith("ZONE 3") ||
    key.startsWith("ZONE 4 C")
  ) {
    return "Marcory";
  }
  if (key === "KOULASSI" || key === "KOU" || key === "KOUMASSI") return "Koumassi";
  if (key.startsWith("PORT") || key.startsWith("PORY BOUET")) return "Port Bouet";

  return trimmed;
}
