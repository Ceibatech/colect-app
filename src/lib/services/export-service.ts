import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma/client";
import { Prisma } from "@prisma/client";
import { stringifyCsv } from "@/lib/utils/csv";
import { getOperateurScopeFilter } from "@/lib/services/access-scope";
import type { SessionPayload } from "@/lib/auth/session";

export interface ExportFilters {
  q?: string;
  communeId?: number;
  operateurId?: number;
  statutValidation?: string;
  statutArchivage?: string;
  nonIndexes?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

const MAX_EXPORT_ROWS = 20_000;

const EXPORT_COLUMNS = [
  "Référence", "Code-barres", "N° guichet", "Direction/Service concerné(e)", "Numéro Direction/Service", "Référence classement",
  "N° îlot", "N° lot", "Superficie", "N° titre foncier", "Commune", "Lotissement", "Nature dossier",
  "Nom", "Prénoms", "Adresse", "Téléphone", "E-mail", "Personne à contacter", "Mobile", "Opérateur",
  "Statut collecte", "Statut validation", "Statut numérisation", "Statut indexation", "Statut archivage",
  "Date soumission", "Date validation", "Date numérisation", "Date indexation", "Date archivage", "Créé le",
];

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

async function loadExportRows(filters: ExportFilters, session: SessionPayload) {
  const where: Prisma.DossierWhereInput = {};

  // OPERATEUR : toujours sa propre fiche. SUPERVISEUR (Phase 16+) : ses
  // opérateurs affectés — un filtre `operateurId` du formulaire n'est
  // honoré que s'il tombe dans ce périmètre (jamais de confiance dans une
  // valeur client pour l'élargir, cf. access-scope.ts).
  const scope = await getOperateurScopeFilter(session);
  if (scope !== undefined) {
    const filterInScope =
      filters.operateurId !== undefined &&
      (scope === filters.operateurId || (typeof scope === "object" && scope.in.includes(filters.operateurId)));
    where.operateurId = filterInScope ? filters.operateurId! : scope;
  } else if (filters.operateurId) {
    where.operateurId = filters.operateurId;
  }

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [
        { reference: { contains: q } },
        { codeBarres: { contains: q } },
        { numeroDdu: { contains: q } },
        { numeroDirectionService: { contains: q } },
        { nom: { contains: q } },
        { prenoms: { contains: q } },
      ];
    }
  }
  if (filters.communeId) where.communeId = filters.communeId;
  if (filters.statutValidation) where.statutValidation = filters.statutValidation as Prisma.EnumStatutValidationFilter["equals"];
  if (filters.statutArchivage) where.statutArchivage = filters.statutArchivage as Prisma.EnumStatutArchivageFilter["equals"];
  if (filters.nonIndexes) where.statutIndexation = { not: "TERMINE" };
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return prisma.dossier.findMany({
    where,
    take: MAX_EXPORT_ROWS,
    orderBy: { createdAt: "desc" },
    include: {
      commune: { select: { nom: true } },
      lotissement: { select: { nom: true } },
      natureDossier: { select: { libelle: true } },
      operateur: { select: { nom: true, prenoms: true, matricule: true } },
    },
  });
}

function toRow(d: Awaited<ReturnType<typeof loadExportRows>>[number]): (string | number)[] {
  return [
    d.reference,
    d.codeBarres ?? "",
    d.numeroGuichet ?? "",
    d.numeroDdu ?? "",
    d.numeroDirectionService ?? "",
    d.referenceClassement ?? "",
    d.numeroIlot ?? "",
    d.numeroLot ?? "",
    d.superficie ? Number(d.superficie) : "",
    d.numeroTitreFoncier ?? "",
    d.commune?.nom ?? "",
    d.lotissement?.nom ?? "",
    d.natureDossier?.libelle ?? "",
    d.nom ?? "",
    d.prenoms ?? "",
    d.adresse ?? "",
    d.telephone ?? "",
    d.email ?? "",
    d.personneContact ?? "",
    d.mobile ?? "",
    d.operateur ? `${d.operateur.nom} ${d.operateur.prenoms ?? ""} (${d.operateur.matricule})` : "",
    d.statutCollecte,
    d.statutValidation,
    d.statutNumerisation,
    d.statutIndexation,
    d.statutArchivage,
    fmtDate(d.dateSoumission),
    fmtDate(d.dateValidation),
    fmtDate(d.dateNumerisation),
    fmtDate(d.dateIndexation),
    fmtDate(d.dateArchivage),
    fmtDate(d.createdAt),
  ];
}

export interface ExportResult {
  buffer: Buffer;
  count: number;
  contentType: string;
  fileName: string;
}

export async function buildExport(
  filters: ExportFilters,
  format: "csv" | "xlsx",
  session: SessionPayload
): Promise<ExportResult> {
  const dossiers = await loadExportRows(filters, session);
  const rows = dossiers.map(toRow);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const csv = stringifyCsv([EXPORT_COLUMNS, ...rows]);
    return {
      buffer: Buffer.from("﻿" + csv, "utf-8"), // BOM pour compatibilité Excel
      count: rows.length,
      contentType: "text/csv; charset=utf-8",
      fileName: `dossiers-${stamp}.csv`,
    };
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dossiers");
  sheet.addRow(EXPORT_COLUMNS);
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));
  sheet.columns.forEach((col) => {
    col.width = 18;
  });
  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(buffer),
    count: rows.length,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: `dossiers-${stamp}.xlsx`,
  };
}
