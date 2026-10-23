export function normalizePersonName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("fr-FR");
}

export function personInitials(value: string) {
  const words = normalizePersonName(value).split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`;
}
