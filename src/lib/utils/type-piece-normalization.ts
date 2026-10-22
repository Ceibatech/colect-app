export interface CanonicalTypePiece {
  label: string;
  aliases: readonly string[];
}

const CANONICAL_TYPE_PIECES: readonly CanonicalTypePiece[] = [
  {
    label: "Carte nationale d'identité",
    aliases: [
      "CNI",
      "carte nationale identite",
      "carte nationale d identite",
      "carte d identite nationale",
    ],
  },
  {
    label: "Carte de résident",
    aliases: [
      "carte resident",
      "carte de resident",
      "carte residant",
      "carte de residant",
      "titre de sejour",
    ],
  },
  {
    label: "Carte consulaire",
    aliases: ["carte consulair", "carte du consulat"],
  },
  {
    label: "Extrait topographique",
    aliases: ["extrait topo", "extrait topographique", "plan topo", "plan topographique"],
  },
  {
    label: "Acte de naissance",
    aliases: [
      "acte naissance",
      "acte de naissance",
      "extrait naissance",
      "extrait de naissance",
      "extrait acte de naissance",
      "extrait d acte de naissance",
    ],
  },
  {
    label: "Procès-verbal",
    aliases: ["PV", "proces verbal", "proces-verbal"],
  },
  {
    label: "Arrêté de concession provisoire",
    aliases: ["ACP", "arrete concession provisoire", "arrete de concession provisoire"],
  },
  {
    label: "Attestation d'attribution",
    aliases: ["attestation attribution", "attestation d attribution"],
  },
  {
    label: "Lettre d'attribution",
    aliases: ["lettre attribution", "lettre d attribution"],
  },
] as const;

/** Clé de comparaison tolérante aux accents, apostrophes et ponctuations. */
export function normalizeTypePieceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const CANONICAL_BY_ALIAS = new Map<string, string>();

for (const entry of CANONICAL_TYPE_PIECES) {
  for (const alias of [entry.label, ...entry.aliases]) {
    CANONICAL_BY_ALIAS.set(normalizeTypePieceText(alias), entry.label);
  }
}

function cleanUnknownLabel(value: string): string {
  const compact = value.trim().replace(/\s+/g, " ");
  if (!compact) return "";
  return compact.charAt(0).toLocaleUpperCase("fr") + compact.slice(1);
}

/** Retourne le libellé métier commun, ou nettoie prudemment une nouvelle valeur. */
export function canonicalizeTypePieceLabel(value: string): string {
  const key = normalizeTypePieceText(value);
  if (!key) return "";
  return CANONICAL_BY_ALIAS.get(key) ?? cleanUnknownLabel(value);
}

/** Clé unique fonctionnelle utilisée pour éviter les doublons de référentiel. */
export function getTypePieceMatchKey(value: string): string {
  return normalizeTypePieceText(canonicalizeTypePieceLabel(value));
}

function getSearchTerms(value: string): string[] {
  const canonicalLabel = canonicalizeTypePieceLabel(value);
  const canonicalKey = normalizeTypePieceText(canonicalLabel);
  const entry = CANONICAL_TYPE_PIECES.find(
    (candidate) => normalizeTypePieceText(candidate.label) === canonicalKey,
  );

  return Array.from(
    new Set(
      [value, canonicalLabel, ...(entry?.aliases ?? [])]
        .map(normalizeTypePieceText)
        .filter(Boolean),
    ),
  );
}

/** Classe les propositions sans fusion floue risquée de deux documents distincts. */
export function getTypePieceSuggestionScore(input: string, candidate: string): number {
  const inputTerms = Array.from(
    new Set([normalizeTypePieceText(input), getTypePieceMatchKey(input)].filter(Boolean)),
  );
  if (inputTerms.length === 0) return 0;

  const candidateTerms = getSearchTerms(candidate);
  if (inputTerms.some((term) => candidateTerms.includes(term))) return 100;
  if (inputTerms.some((term) => candidateTerms.some((candidateTerm) => candidateTerm.startsWith(term)))) {
    return 80;
  }
  if (inputTerms.some((term) => candidateTerms.some((candidateTerm) => candidateTerm.includes(term)))) {
    return 60;
  }

  const inputTokens = inputTerms[0].split(" ");
  if (
    inputTokens.length > 1 &&
    inputTokens.every((token) => candidateTerms.some((candidateTerm) => candidateTerm.includes(token)))
  ) {
    return 40;
  }

  return 0;
}
