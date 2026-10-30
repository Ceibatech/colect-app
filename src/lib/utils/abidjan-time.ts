/**
 * Heures saisies dans les formulaires (champ date et heure, sans fuseau) :
 * elles s'entendent toujours à l'heure d'Abidjan (UTC+0), quel que soit le
 * réglage du téléphone ou du serveur.
 */
export function parseAbidjanDateTime(value: string): Date {
  const trimmed = value.trim();
  // Une valeur déjà munie d'un fuseau (Z ou ±hh:mm) est prise telle quelle.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return new Date(trimmed);
  return new Date(`${trimmed.length === 16 ? `${trimmed}:00` : trimmed}Z`);
}

/** Maintenant, à l'heure d'Abidjan, au format d'un champ date et heure (AAAA-MM-JJTHH:MM). */
export function abidjanNowInputValue(now = new Date()): string {
  return now.toISOString().slice(0, 16);
}
