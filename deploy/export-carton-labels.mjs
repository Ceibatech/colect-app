// Export en lecture seule des libellés de cartons, pour repérer les erreurs de
// saisie d'un même carton. Aucune donnée personnelle : site, salle, CTN,
// libellé tel que saisi et nombres de dossiers. Écrit un CSV (« ; », UTF-8
// avec BOM) sur la sortie standard ; aucune écriture en base.
//
//   node deploy/export-carton-labels.mjs > libelles-cartons.csv
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const HEADER = [
  "site_code", "site", "salle_code", "salle", "ctn", "libelle_saisi",
  "dossiers_avec_ce_libelle", "dossiers_du_carton", "libelles_differents_dans_le_carton",
  "codes_barres_distincts", "exemple_code_barres",
];

export function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Neutralise les formules à l'ouverture dans un tableur.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function formatCtn(id) {
  return id ? `CTN-${String(id).padStart(8, "0")}` : "";
}

export async function loadCartonLabelRows(db) {
  return db.$queryRawUnsafe(`
    SELECT s.code AS site_code, s.nom AS site, e.code AS salle_code, e.nom AS salle,
      d.carton_id AS carton_id, d.libelle_carton AS libelle,
      COUNT(*) AS dossiers,
      COUNT(DISTINCT NULLIF(TRIM(d.code_barres), '')) AS codes,
      MIN(NULLIF(TRIM(d.code_barres), '')) AS exemple_code,
      c.dossiers_du_carton, c.libelles_du_carton
    FROM dossiers d
    LEFT JOIN sites s ON s.id = d.site_id
    LEFT JOIN entrepots e ON e.id = d.entrepot_id
    LEFT JOIN (
      SELECT carton_id, COUNT(*) AS dossiers_du_carton,
        COUNT(DISTINCT COALESCE(libelle_carton, '')) AS libelles_du_carton
      FROM dossiers WHERE carton_id IS NOT NULL GROUP BY carton_id
    ) c ON c.carton_id = d.carton_id
    GROUP BY s.code, s.nom, e.code, e.nom, d.carton_id, d.libelle_carton, c.dossiers_du_carton, c.libelles_du_carton
    ORDER BY s.nom, e.nom, d.libelle_carton, d.carton_id`);
}

export function toCsv(rows) {
  const n = (value) => (value === null || value === undefined ? "" : Number(value));
  const lines = [HEADER.join(";")];
  for (const row of rows) {
    lines.push([
      row.site_code, row.site, row.salle_code, row.salle, formatCtn(row.carton_id), row.libelle,
      n(row.dossiers), n(row.dossiers_du_carton), n(row.libelles_du_carton), n(row.codes), row.exemple_code,
    ].map(csvCell).join(";"));
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const prisma = new PrismaClient();
  try {
    if (process.argv.length !== 2) throw new Error("Arguments inattendus.");
    const rows = await loadCartonLabelRows(prisma);
    process.stdout.write(toCsv(rows));
    console.error(`Export des libellés : ${rows.length} ligne(s).`);
  } catch (error) {
    console.error(`Export des libellés échoué : ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
