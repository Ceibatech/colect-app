/**
 * Parseur/générateur CSV minimal (RFC 4180) : champs entre guillemets,
 * guillemet interne doublé (`""`), séparateur `,`, fin de ligne `\r\n` ou
 * `\n`. Volontairement sans dépendance externe (le besoin est simple et
 * entièrement maîtrisé — voir aussi le choix documenté d'éviter le paquet
 * `xlsx` pour raison de sécurité, cf. SECURITY.md).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Retire un BOM UTF-8 éventuel (fichiers exportés depuis Excel).
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function stringifyCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) => row.map((cell) => escapeCsvField(cell === null || cell === undefined ? "" : String(cell))).join(","))
    .join("\r\n");
}
