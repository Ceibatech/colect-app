import "server-only";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { parseCsv } from "@/lib/utils/csv";
import { IMPORT_COLUMNS } from "@/lib/validation/import-columns";

// Réexporté pour compatibilité (les en-têtes sont reconnus de façon
// insensible à la casse/aux espaces ; Commune, Lotissement et Nature de
// dossier sont résolus par code OU libellé) — voir import-columns.ts pour la
// définition (extraite pour rester importable hors contexte serveur, §72).
export { IMPORT_COLUMNS };

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const HEADER_LOOKUP = new Map(IMPORT_COLUMNS.map((c) => [normalizeHeader(c.header), c.key]));

export interface ImportRowData {
  operateurMatricule?: string;
  libelleCarton?: string;
  codeBarres?: string;
  numeroGuichet?: string;
  numeroDdu?: string;
  numeroDirectionService?: string;
  referenceClassement?: string;
  numeroIlot?: string;
  numeroLot?: string;
  superficie?: string;
  numeroTitreFoncier?: string;
  communeRef?: string;
  lotissementRef?: string;
  natureRef?: string;
  nom?: string;
  prenoms?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  personneContact?: string;
  mobile?: string;
}

export interface ImportRowResult {
  line: number;
  data: ImportRowData;
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  isValid: boolean;
}

export interface ImportPreview {
  fileName: string;
  totalLignes: number;
  valides: number;
  invalides: number;
  doublons: number;
  importables: number;
  rows: ImportRowResult[];
}

/** Lit un buffer .csv ou .xlsx et retourne des lignes de tableau brutes (avec en-tête). */
async function readRows(buffer: Buffer, fileName: string): Promise<string[][]> {
  const isCsv = fileName.toLowerCase().endsWith(".csv");
  if (isCsv) {
    return parseCsv(buffer.toString("utf-8"));
  }

  const workbook = new ExcelJS.Workbook();
  // Cast : exceljs embarque une définition de `Buffer` (ES2024, champs
  // maxByteLength/resizable/...) qui diverge de celle de notre @types/node
  // — incompatibilité de types uniquement, aucun impact runtime (même
  // classe Node Buffer des deux côtés).
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1); // index 0 est vide (ExcelJS 1-indexé)
    rows.push(values.map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return rows;
}

function rowsToObjects(rows: string[][]): ImportRowData[] {
  if (rows.length === 0) return [];
  const headerRow = rows[0];
  const keys = headerRow.map((h) => HEADER_LOOKUP.get(normalizeHeader(h)) ?? null);

  return rows.slice(1).map((row) => {
    const obj: ImportRowData = {};
    keys.forEach((key, i) => {
      if (key && row[i] !== undefined && row[i] !== "") {
        (obj as Record<string, string>)[key] = String(row[i]).trim();
      }
    });
    return obj;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RefMaps {
  operateurByMatricule: Map<string, number>;
  communeByRef: Map<string, number>;
  lotissementByRef: Map<string, number>;
  natureByRef: Map<string, number>;
  existingBarcodes: Set<string>;
}

async function loadRefMaps(): Promise<RefMaps> {
  const [operateurs, communes, lotissements, natures, existingCodeBarres] = await Promise.all([
    prisma.operateur.findMany({ where: { isActive: true }, select: { id: true, matricule: true } }),
    prisma.commune.findMany({ select: { id: true, code: true, nom: true } }),
    prisma.lotissement.findMany({ select: { id: true, code: true, nom: true } }),
    prisma.natureDossier.findMany({ select: { id: true, code: true, libelle: true } }),
    prisma.dossier.findMany({ where: { codeBarres: { not: null } }, select: { codeBarres: true } }),
  ]);

  return {
    operateurByMatricule: new Map(operateurs.map((o) => [o.matricule.toLowerCase(), o.id])),
    communeByRef: new Map(communes.flatMap((c) => [[c.code.toLowerCase(), c.id], [c.nom.toLowerCase(), c.id]] as const)),
    lotissementByRef: new Map(lotissements.flatMap((l) => [[l.code.toLowerCase(), l.id], [l.nom.toLowerCase(), l.id]] as const)),
    natureByRef: new Map(natures.flatMap((n) => [[n.code.toLowerCase(), n.id], [n.libelle.toLowerCase(), n.id]] as const)),
    existingBarcodes: new Set(existingCodeBarres.map((d) => d.codeBarres!)),
  };
}

/**
 * Valide un lot de lignes déjà extraites (fichier ou re-soumission de
 * confirmation). Re-résout systématiquement les références en base — ne
 * fait jamais confiance à un état "valide" renvoyé par le client.
 */
function validateDataRows(dataRows: ImportRowData[], maps: RefMaps): ImportRowResult[] {
  const seenBarcodesInFile = new Set<string>();

  return dataRows.map((data, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    let isDuplicate = false;

    if (!data.operateurMatricule || !maps.operateurByMatricule.has(data.operateurMatricule.toLowerCase())) {
      errors.push(`Opérateur "${data.operateurMatricule ?? ""}" introuvable ou inactif.`);
    }

    if (data.codeBarres) {
      if (maps.existingBarcodes.has(data.codeBarres) || seenBarcodesInFile.has(data.codeBarres)) {
        isDuplicate = true;
        errors.push(`Code-barres "${data.codeBarres}" déjà utilisé (base ou fichier).`);
      } else {
        seenBarcodesInFile.add(data.codeBarres);
      }
    }

    if (data.communeRef && !maps.communeByRef.has(data.communeRef.toLowerCase())) {
      warnings.push(`Commune "${data.communeRef}" non reconnue — ignorée.`);
    }
    if (data.lotissementRef && !maps.lotissementByRef.has(data.lotissementRef.toLowerCase())) {
      warnings.push(`Lotissement "${data.lotissementRef}" non reconnu — ignoré.`);
    }
    if (data.natureRef && !maps.natureByRef.has(data.natureRef.toLowerCase())) {
      warnings.push(`Nature de dossier "${data.natureRef}" non reconnue — ignorée.`);
    }
    if (data.email && !EMAIL_RE.test(data.email)) {
      warnings.push(`E-mail "${data.email}" au format invalide — conservé tel quel.`);
    }
    if (data.superficie && !(Number(data.superficie) > 0)) {
      warnings.push(`Superficie "${data.superficie}" invalide — ignorée.`);
    }
    if (!data.nom && !data.prenoms) {
      warnings.push("Nom et prénoms non renseignés.");
    }

    return {
      line: idx + 2, // +1 en-tête, +1 index 1-based
      data,
      errors,
      warnings,
      isDuplicate,
      isValid: errors.length === 0,
    };
  });
}

function summarize(fileName: string, results: ImportRowResult[]): ImportPreview {
  const invalides = results.filter((r) => !r.isValid && !r.isDuplicate).length;
  const doublons = results.filter((r) => r.isDuplicate).length;
  const valides = results.filter((r) => r.isValid).length;

  return {
    fileName,
    totalLignes: results.length,
    valides,
    invalides,
    doublons,
    importables: valides,
    rows: results,
  };
}

export async function parseAndValidateImport(buffer: Buffer, fileName: string): Promise<ImportPreview> {
  const rawRows = await readRows(buffer, fileName);
  const dataRows = rowsToObjects(rawRows);
  const maps = await loadRefMaps();
  const results = validateDataRows(dataRows, maps);
  return summarize(fileName, results);
}

export interface ConfirmImportResult {
  importId: number;
  imported: number;
  skipped: number;
}

const IMPORT_BATCH_SIZE = 500;

function getReferenceSequence(reference: string | undefined, year: number): number {
  const prefix = `DOS-${year}-`;
  if (!reference?.startsWith(prefix)) return 1;
  const sequence = Number(reference.slice(prefix.length));
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence + 1 : 1;
}

function buildDossierImportData(
  row: ImportRowResult,
  maps: RefMaps,
  reference: string,
): Prisma.DossierCreateManyInput {
  const data = row.data;
  const superficie = data.superficie && Number(data.superficie) > 0 ? Number(data.superficie) : null;

  return {
    reference,
    operateurId: maps.operateurByMatricule.get((data.operateurMatricule ?? "").toLowerCase())!,
    libelleCarton: data.libelleCarton || null,
    codeBarres: data.codeBarres || null,
    numeroGuichet: data.numeroGuichet || null,
    numeroDdu: data.numeroDdu || null,
    numeroDirectionService: data.numeroDirectionService || null,
    referenceClassement: data.referenceClassement || null,
    numeroIlot: data.numeroIlot || null,
    numeroLot: data.numeroLot || null,
    superficie,
    numeroTitreFoncier: data.numeroTitreFoncier || null,
    communeId: data.communeRef ? (maps.communeByRef.get(data.communeRef.toLowerCase()) ?? null) : null,
    lotissementId: data.lotissementRef ? (maps.lotissementByRef.get(data.lotissementRef.toLowerCase()) ?? null) : null,
    natureDossierId: data.natureRef ? (maps.natureByRef.get(data.natureRef.toLowerCase()) ?? null) : null,
    nom: data.nom || null,
    prenoms: data.prenoms || null,
    adresse: data.adresse || null,
    telephone: data.telephone || null,
    email: data.email || null,
    personneContact: data.personneContact || null,
    mobile: data.mobile || null,
    statutCollecte: "BROUILLON",
  };
}

/**
 * Ré-exécute la validation côté serveur sur les lignes reçues (jamais de
 * confiance dans le statut "valide" renvoyé par le client — §60) et ne crée
 * en base que les lignes qui repassent la validation. Dossiers créés en
 * statut BROUILLON (à compléter/soumettre ensuite via la Collecte).
 */
export async function confirmImport(userId: number, fileName: string, dataRows: ImportRowData[]): Promise<ConfirmImportResult> {
  const maps = await loadRefMaps();
  const results = validateDataRows(dataRows, maps);
  const validRows = results.filter((r) => r.isValid);

  const year = new Date().getFullYear();

  const importRecord = await prisma.import.create({
    data: {
      userId,
      nomFichier: fileName,
      typeFichier: fileName.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX",
      nombreLignes: results.length,
      nombreValides: results.filter((r) => r.isValid).length,
      nombreInvalides: results.filter((r) => !r.isValid && !r.isDuplicate).length,
      nombreDoublons: results.filter((r) => r.isDuplicate).length,
      nombreImportes: 0,
      statut: "EN_COURS",
    },
  });

  try {
    const imported = await prisma.$transaction(
      async (tx) => {
        const latestDossier = await tx.dossier.findFirst({
          where: { reference: { startsWith: `DOS-${year}-` } },
          orderBy: { reference: "desc" },
          select: { reference: true },
        });
        let sequence = getReferenceSequence(latestDossier?.reference, year);
        let createdCount = 0;

        for (let offset = 0; offset < validRows.length; offset += IMPORT_BATCH_SIZE) {
          const rows = validRows.slice(offset, offset + IMPORT_BATCH_SIZE);
          const batch = rows.map((row) => {
            const reference = `DOS-${year}-${String(sequence++).padStart(6, "0")}`;
            return { row, reference, data: buildDossierImportData(row, maps, reference) };
          });

          await tx.dossier.createMany({ data: batch.map((item) => item.data) });
          const created = await tx.dossier.findMany({
            where: { reference: { in: batch.map((item) => item.reference) } },
            select: { id: true, reference: true },
          });
          if (created.length !== batch.length) {
            throw new Error(`Import incomplet : ${created.length}/${batch.length} dossiers créés dans un lot.`);
          }

          const idByReference = new Map(created.map((dossier) => [dossier.reference, dossier.id]));
          await tx.dossierHistory.createMany({
            data: batch.map(({ row, reference }) => ({
              dossierId: idByReference.get(reference)!,
              userId,
              action: "IMPORT",
              nouveauStatut: "BROUILLON",
              commentaire: `Importé depuis ${fileName} (ligne ${row.line}).`,
            })),
          });
          createdCount += batch.length;
        }

        return createdCount;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 },
    );

    await prisma.import.update({
      where: { id: importRecord.id },
      data: { nombreImportes: imported, statut: "TERMINE", completedAt: new Date() },
    });

    return { importId: importRecord.id, imported, skipped: results.length - imported };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue pendant l'import.";
    await prisma.import.update({
      where: { id: importRecord.id },
      data: { nombreImportes: 0, statut: "ECHEC", erreurs: { message }, completedAt: new Date() },
    });
    throw error;
  }
}

/** Génère un modèle .xlsx vierge (en-têtes uniquement) pour faciliter l'import. */
export async function generateImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Import dossiers");
  sheet.addRow(IMPORT_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((col) => {
    col.width = 22;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
