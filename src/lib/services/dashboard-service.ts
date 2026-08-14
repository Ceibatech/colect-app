import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { computeRate as rate } from "@/lib/utils/rate";

/**
 * KPI globaux du dashboard (§46/§47). "Collectés" et "Soumis" partagent la
 * même valeur dans notre modèle : la collecte (fiche CG1020) n'a que deux
 * états (BROUILLON/SOUMIS — voir DATABASE.md), "collecté" est donc
 * interprété comme "collecte terminée et soumise". Hypothèse documentée,
 * à confirmer avec le métier si une notion intermédiaire est souhaitée.
 */
export interface DashboardKpis {
  total: number;
  collectes: number;
  soumis: number;
  enControle: number;
  valides: number;
  rejetes: number;
  numerises: number;
  indexes: number;
  archives: number;
  tauxGlobal: number;
  tauxCollecte: number;
  tauxValidation: number;
  tauxNumerisation: number;
  tauxIndexation: number;
  tauxArchivage: number;
}

interface GlobalRow {
  total_dossiers: bigint;
  total_soumis: bigint;
  total_en_controle: bigint;
  total_valides: bigint;
  total_rejetes: bigint;
  total_numerises: bigint;
  total_indexes: bigint;
  total_archives: bigint;
}

/**
 * Mémoïsée par requête (`cache()` de React, même mécanisme que `getSession()`
 * dans current-user.ts) — Phase 14 (§94, optimisation) : `getPipelineFunnel()`
 * et `getDirectionOverview()` appellent aussi `getDashboardKpis()` en
 * interne, et la page `/dashboard` appelle en plus la fonction directement
 * dans le même `Promise.all` ; sans mémoïsation, `vw_dashboard_global` était
 * interrogée deux fois pour un seul rendu de cette page.
 */
export const getDashboardKpis = cache(async (): Promise<DashboardKpis> => {
  await requirePermission("DASHBOARD_VIEW");

  const rows = await prisma.$queryRaw<GlobalRow[]>`SELECT * FROM vw_dashboard_global`;
  const r = rows[0];
  if (!r) {
    return {
      total: 0, collectes: 0, soumis: 0, enControle: 0, valides: 0, rejetes: 0,
      numerises: 0, indexes: 0, archives: 0,
      tauxGlobal: 0, tauxCollecte: 0, tauxValidation: 0, tauxNumerisation: 0, tauxIndexation: 0, tauxArchivage: 0,
    };
  }

  const total = Number(r.total_dossiers);
  const soumis = Number(r.total_soumis);
  const valides = Number(r.total_valides);
  const numerises = Number(r.total_numerises);
  const indexes = Number(r.total_indexes);
  const archives = Number(r.total_archives);

  return {
    total,
    collectes: soumis,
    soumis,
    enControle: Number(r.total_en_controle),
    valides,
    rejetes: Number(r.total_rejetes),
    numerises,
    indexes,
    archives,
    tauxGlobal: rate(archives, total),
    tauxCollecte: rate(soumis, total),
    tauxValidation: rate(valides, soumis),
    tauxNumerisation: rate(numerises, valides),
    tauxIndexation: rate(indexes, numerises),
    tauxArchivage: rate(archives, indexes),
  };
});

export type EvolutionType = "collecte" | "validation" | "numerisation" | "indexation" | "archivage";

const EVOLUTION_VIEWS: Record<EvolutionType, string> = {
  collecte: "vw_evolution_collecte",
  validation: "vw_evolution_validation",
  numerisation: "vw_evolution_numerisation",
  indexation: "vw_evolution_indexation",
  archivage: "vw_evolution_archivage",
};

export interface EvolutionPoint {
  mois: string;
  total: number;
}

async function getEvolution(type: EvolutionType): Promise<EvolutionPoint[]> {
  const view = EVOLUTION_VIEWS[type];
  // Nom de vue whitelisté ci-dessus (pas d'entrée utilisateur) — sûr malgré queryRawUnsafe.
  const rows = await prisma.$queryRawUnsafe<Array<{ mois: string; total: bigint }>>(
    `SELECT mois, total FROM ${view} ORDER BY mois`
  );
  return rows.map((r) => ({ mois: r.mois, total: Number(r.total) }));
}

/** Évolution mensuelle combinée des 5 étapes du pipeline (§48 items 1-5). */
export async function getPipelineEvolution(): Promise<Array<{ mois: string } & Record<EvolutionType, number>>> {
  await requirePermission("DASHBOARD_VIEW");

  const [collecte, validation, numerisation, indexation, archivage] = await Promise.all([
    getEvolution("collecte"),
    getEvolution("validation"),
    getEvolution("numerisation"),
    getEvolution("indexation"),
    getEvolution("archivage"),
  ]);

  const months = new Set<string>();
  for (const series of [collecte, validation, numerisation, indexation, archivage]) {
    for (const p of series) months.add(p.mois);
  }

  const toMap = (series: EvolutionPoint[]) => new Map(series.map((p) => [p.mois, p.total]));
  const maps = {
    collecte: toMap(collecte),
    validation: toMap(validation),
    numerisation: toMap(numerisation),
    indexation: toMap(indexation),
    archivage: toMap(archivage),
  };

  return [...months].sort().map((mois) => ({
    mois,
    collecte: maps.collecte.get(mois) ?? 0,
    validation: maps.validation.get(mois) ?? 0,
    numerisation: maps.numerisation.get(mois) ?? 0,
    indexation: maps.indexation.get(mois) ?? 0,
    archivage: maps.archivage.get(mois) ?? 0,
  }));
}

/** Pipeline global — nombre de dossiers ayant atteint chaque étape (§48 item 6). */
export async function getPipelineFunnel(): Promise<Array<{ etape: string; total: number }>> {
  const kpis = await getDashboardKpis();
  return [
    { etape: "Collecte", total: kpis.total },
    { etape: "Validation", total: kpis.valides },
    { etape: "Numérisation", total: kpis.numerises },
    { etape: "Indexation", total: kpis.indexes },
    { etape: "Archivage", total: kpis.archives },
  ];
}

export interface RepartitionRow {
  label: string;
  total: number;
}

/** Répartition par commune (§48 item 7) — via la vue de reporting Phase 2. */
export async function getRepartitionByCommune(): Promise<RepartitionRow[]> {
  await requirePermission("DASHBOARD_VIEW");
  const rows = await prisma.$queryRaw<Array<{ commune_nom: string; total_dossiers: bigint }>>`
    SELECT commune_nom, total_dossiers FROM vw_dossiers_par_commune WHERE total_dossiers > 0 ORDER BY total_dossiers DESC
  `;
  return rows.map((r) => ({ label: r.commune_nom, total: Number(r.total_dossiers) }));
}

/** Répartition par lotissement (§48 item 8) — pas de vue dédiée (non prévue §63), agrégation directe. */
export async function getRepartitionByLotissement(): Promise<RepartitionRow[]> {
  await requirePermission("DASHBOARD_VIEW");
  const grouped = await prisma.dossier.groupBy({
    by: ["lotissementId"],
    where: { lotissementId: { not: null } },
    _count: { _all: true },
  });
  const lotissements = await prisma.lotissement.findMany({ select: { id: true, nom: true } });
  const names = new Map(lotissements.map((l) => [l.id, l.nom]));
  return grouped
    .map((g) => ({ label: names.get(g.lotissementId!) ?? `#${g.lotissementId}`, total: g._count._all }))
    .sort((a, b) => b.total - a.total);
}

/** Répartition par nature de dossier (§48 item 9). */
export async function getRepartitionByNature(): Promise<RepartitionRow[]> {
  await requirePermission("DASHBOARD_VIEW");
  const grouped = await prisma.dossier.groupBy({
    by: ["natureDossierId"],
    where: { natureDossierId: { not: null } },
    _count: { _all: true },
  });
  const natures = await prisma.natureDossier.findMany({ select: { id: true, libelle: true } });
  const names = new Map(natures.map((n) => [n.id, n.libelle]));
  return grouped
    .map((g) => ({ label: names.get(g.natureDossierId!) ?? `#${g.natureDossierId}`, total: g._count._all }))
    .sort((a, b) => b.total - a.total);
}

/** Répartition par statut de validation (§48 item 11). */
export async function getRepartitionByStatut(): Promise<RepartitionRow[]> {
  await requirePermission("DASHBOARD_VIEW");
  const rows = await prisma.$queryRaw<Array<{ statut: string; total: bigint }>>`
    SELECT statut, total FROM vw_dossiers_par_statut WHERE workflow_type = 'VALIDATION' ORDER BY statut
  `;
  const LABELS: Record<string, string> = { EN_ATTENTE: "En attente", EN_CONTROLE: "En contrôle", VALIDE: "Validé", REJETE: "Rejeté" };
  return rows.map((r) => ({ label: LABELS[r.statut] ?? r.statut, total: Number(r.total) }));
}

export interface OperateurPerformanceRow {
  id: number;
  operateur: string;
  collectes: number;
  soumis: number;
  valides: number;
  rejetes: number;
  numerises: number;
  indexes: number;
  archives: number;
  anomalies: number;
  performance: number; // % de dossiers archivés parmi les dossiers de l'opérateur
}

/** Performance des opérateurs (§48 item 10 / §50) — via la vue Phase 2 + anomalies. */
export async function getOperateurPerformance(): Promise<OperateurPerformanceRow[]> {
  await requirePermission("DASHBOARD_VIEW");

  const rows = await prisma.$queryRaw<
    Array<{
      operateur_id: number;
      operateur_matricule: string;
      operateur_nom: string;
      total_dossiers: bigint;
      total_soumis: bigint;
      total_valides: bigint;
      total_rejetes: bigint;
      total_numerises: bigint;
      total_indexes: bigint;
      total_archives: bigint;
    }>
  >`SELECT * FROM vw_dossiers_par_operateur WHERE total_dossiers > 0 ORDER BY total_dossiers DESC`;

  const anomalyCounts = await prisma.$queryRaw<Array<{ operateur_id: number; total: bigint }>>`
    SELECT d.operateur_id AS operateur_id, COUNT(*) AS total
    FROM anomalies a
    JOIN dossiers d ON d.id = a.dossier_id
    WHERE a.statut = 'OUVERTE'
    GROUP BY d.operateur_id
  `;
  const anomalyMap = new Map(anomalyCounts.map((a) => [a.operateur_id, Number(a.total)]));

  return rows
    .map((r) => {
      const total = Number(r.total_dossiers);
      const archives = Number(r.total_archives);
      return {
        id: r.operateur_id,
        operateur: `${r.operateur_nom} (${r.operateur_matricule})`,
        collectes: Number(r.total_soumis),
        soumis: Number(r.total_soumis),
        valides: Number(r.total_valides),
        rejetes: Number(r.total_rejetes),
        numerises: Number(r.total_numerises),
        indexes: Number(r.total_indexes),
        archives,
        anomalies: anomalyMap.get(r.operateur_id) ?? 0,
        performance: rate(archives, total),
      };
    })
    .sort((a, b) => b.performance - a.performance);
}

export interface AnomalyEvolutionPoint {
  mois: string;
  total: number;
}

/** Évolution mensuelle des anomalies (§48 item 12). */
export async function getAnomaliesEvolution(): Promise<AnomalyEvolutionPoint[]> {
  await requirePermission("DASHBOARD_VIEW");
  const rows = await prisma.$queryRaw<Array<{ mois: string; total: bigint }>>`
    SELECT DATE_FORMAT(created_at, '%Y-%m') AS mois, COUNT(*) AS total
    FROM anomalies
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY mois
  `;
  return rows.map((r) => ({ mois: r.mois, total: Number(r.total) }));
}

export interface DirectionOverview extends DashboardKpis {
  dossiersEnRetard: number;
  anomaliesCritiques: number;
}

/**
 * Vue synthétique Direction (§49). "En retard" : dossier non archivé, non
 * rejeté, sans mise à jour depuis plus de 30 jours — seuil applicatif
 * raisonnable en l'absence de SLA officiel (À CONFIRMER AVEC LE MÉTIER).
 */
export async function getDirectionOverview(): Promise<DirectionOverview> {
  await requirePermission("DASHBOARD_VIEW");
  const kpis = await getDashboardKpis();

  const RETARD_SEUIL_JOURS = 30;
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - RETARD_SEUIL_JOURS);

  const [dossiersEnRetard, anomaliesCritiques] = await Promise.all([
    prisma.dossier.count({
      where: { statutArchivage: { not: "TERMINE" }, statutValidation: { not: "REJETE" }, updatedAt: { lt: seuil } },
    }),
    prisma.anomalie.count({ where: { gravite: "CRITIQUE", statut: "OUVERTE" } }),
  ]);

  return { ...kpis, dossiersEnRetard, anomaliesCritiques };
}
