import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { computeRate as rate } from "@/lib/utils/rate";
import { getSupervisorScope } from "@/lib/services/access-scope";

/**
 * Phase 16+ (affectation opérateur -> superviseur) : un SUPERVISEUR ne doit
 * voir, sur TOUT le dashboard, que les agrégats concernant les opérateurs
 * qui lui sont affectés — jamais les vues SQL globales ci-dessous
 * (`vw_*`), qui ne sont pas paramétrables (vues MySQL). Pour ce rôle, les
 * fonctions ci-dessous recalculent donc les mêmes agrégats directement via
 * l'API Prisma (`where operateurId IN (...)`) au lieu d'interroger la vue.
 * Comportement inchangé pour ADMIN/CONSULTATION (et OPERATEUR, qui voyait
 * déjà un dashboard global avant cette phase — non modifié, hors périmètre
 * de cette demande). `getSupervisorScope()` est partagée (access-scope.ts).
 */

/** `where` Prisma correspondant à un scope opérateur (tableau vide -> aucun résultat). */
function scopeWhere(operateurIds: number[]): Prisma.DossierWhereInput {
  return operateurIds.length ? { operateurId: { in: operateurIds } } : { operateurId: -1 };
}

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
function computeKpis(input: {
  total: number; soumis: number; enControle: number; valides: number; rejetes: number;
  numerises: number; indexes: number; archives: number;
}): DashboardKpis {
  const { total, soumis, enControle, valides, rejetes, numerises, indexes, archives } = input;
  return {
    total,
    collectes: soumis,
    soumis,
    enControle,
    valides,
    rejetes,
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
}

async function getDashboardKpisScoped(operateurIds: number[]): Promise<DashboardKpis> {
  const where = scopeWhere(operateurIds);
  const [total, soumis, enControle, valides, rejetes, numerises, indexes, archives] = await Promise.all([
    prisma.dossier.count({ where }),
    prisma.dossier.count({ where: { ...where, statutCollecte: "SOUMIS" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "EN_CONTROLE" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "VALIDE" } }),
    prisma.dossier.count({ where: { ...where, statutValidation: "REJETE" } }),
    prisma.dossier.count({ where: { ...where, statutNumerisation: "TERMINE" } }),
    prisma.dossier.count({ where: { ...where, statutIndexation: "TERMINE" } }),
    prisma.dossier.count({ where: { ...where, statutArchivage: "TERMINE" } }),
  ]);
  return computeKpis({ total, soumis, enControle, valides, rejetes, numerises, indexes, archives });
}

export const getDashboardKpis = cache(async (): Promise<DashboardKpis> => {
  const session = await requirePermission("DASHBOARD_VIEW");

  const scope = await getSupervisorScope(session);
  if (scope) return getDashboardKpisScoped(scope);

  const rows = await prisma.$queryRaw<GlobalRow[]>`SELECT * FROM vw_dashboard_global`;
  const r = rows[0];
  if (!r) {
    return {
      total: 0, collectes: 0, soumis: 0, enControle: 0, valides: 0, rejetes: 0,
      numerises: 0, indexes: 0, archives: 0,
      tauxGlobal: 0, tauxCollecte: 0, tauxValidation: 0, tauxNumerisation: 0, tauxIndexation: 0, tauxArchivage: 0,
    };
  }

  return computeKpis({
    total: Number(r.total_dossiers),
    soumis: Number(r.total_soumis),
    enControle: Number(r.total_en_controle),
    valides: Number(r.total_valides),
    rejetes: Number(r.total_rejetes),
    numerises: Number(r.total_numerises),
    indexes: Number(r.total_indexes),
    archives: Number(r.total_archives),
  });
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

/**
 * Équivalent scopé (SUPERVISEUR) des 5 vues `vw_evolution_*` : les vues
 * SQL ne sont pas paramétrables, donc on recalcule directement en mémoire
 * à partir des dossiers du périmètre (volume attendu par superviseur
 * suffisamment faible pour ne pas justifier une requête SQL dédiée par
 * étape). Reproduit exactement les conditions des vues (cf.
 * prisma/sql/reporting_views.sql) : "validation" exige en plus
 * statut_validation = 'VALIDE', les autres juste la date non nulle.
 */
async function getPipelineEvolutionScoped(
  operateurIds: number[]
): Promise<Array<{ mois: string } & Record<EvolutionType, number>>> {
  const rows = await prisma.dossier.findMany({
    where: scopeWhere(operateurIds),
    select: {
      createdAt: true,
      statutValidation: true,
      dateValidation: true,
      dateNumerisation: true,
      dateIndexation: true,
      dateArchivage: true,
    },
  });

  const monthKey = (d: Date) => d.toISOString().slice(0, 7);
  const counts = new Map<string, Record<EvolutionType, number>>();
  const bump = (mois: string, type: EvolutionType) => {
    const entry = counts.get(mois) ?? { collecte: 0, validation: 0, numerisation: 0, indexation: 0, archivage: 0 };
    entry[type]++;
    counts.set(mois, entry);
  };

  for (const d of rows) {
    bump(monthKey(d.createdAt), "collecte");
    if (d.dateValidation && d.statutValidation === "VALIDE") bump(monthKey(d.dateValidation), "validation");
    if (d.dateNumerisation) bump(monthKey(d.dateNumerisation), "numerisation");
    if (d.dateIndexation) bump(monthKey(d.dateIndexation), "indexation");
    if (d.dateArchivage) bump(monthKey(d.dateArchivage), "archivage");
  }

  return [...counts.keys()].sort().map((mois) => ({ mois, ...counts.get(mois)! }));
}

/** Évolution mensuelle combinée des 5 étapes du pipeline (§48 items 1-5). */
export async function getPipelineEvolution(): Promise<Array<{ mois: string } & Record<EvolutionType, number>>> {
  const session = await requirePermission("DASHBOARD_VIEW");

  const scope = await getSupervisorScope(session);
  if (scope) return getPipelineEvolutionScoped(scope);

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
  const session = await requirePermission("DASHBOARD_VIEW");

  const scope = await getSupervisorScope(session);
  if (scope) {
    const grouped = await prisma.dossier.groupBy({
      by: ["communeId"],
      where: { ...scopeWhere(scope), communeId: { not: null } },
      _count: { _all: true },
    });
    const communes = await prisma.commune.findMany({ select: { id: true, nom: true } });
    const names = new Map(communes.map((c) => [c.id, c.nom]));
    return grouped
      .map((g) => ({ label: names.get(g.communeId!) ?? `#${g.communeId}`, total: g._count._all }))
      .sort((a, b) => b.total - a.total);
  }

  const rows = await prisma.$queryRaw<Array<{ commune_nom: string; total_dossiers: bigint }>>`
    SELECT commune_nom, total_dossiers FROM vw_dossiers_par_commune WHERE total_dossiers > 0 ORDER BY total_dossiers DESC
  `;
  return rows.map((r) => ({ label: r.commune_nom, total: Number(r.total_dossiers) }));
}

/** Répartition par lotissement (§48 item 8) — pas de vue dédiée (non prévue §63), agrégation directe. */
export async function getRepartitionByLotissement(): Promise<RepartitionRow[]> {
  const session = await requirePermission("DASHBOARD_VIEW");
  const scope = await getSupervisorScope(session);

  const grouped = await prisma.dossier.groupBy({
    by: ["lotissementId"],
    where: { lotissementId: { not: null }, ...(scope ? scopeWhere(scope) : {}) },
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
  const session = await requirePermission("DASHBOARD_VIEW");
  const scope = await getSupervisorScope(session);

  const grouped = await prisma.dossier.groupBy({
    by: ["natureDossierId"],
    where: { natureDossierId: { not: null }, ...(scope ? scopeWhere(scope) : {}) },
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
  const session = await requirePermission("DASHBOARD_VIEW");
  const LABELS: Record<string, string> = { EN_ATTENTE: "En attente", EN_CONTROLE: "En contrôle", VALIDE: "Validé", REJETE: "Rejeté" };

  const scope = await getSupervisorScope(session);
  if (scope) {
    const grouped = await prisma.dossier.groupBy({
      by: ["statutValidation"],
      where: scopeWhere(scope),
      _count: { _all: true },
    });
    return grouped
      .sort((a, b) => a.statutValidation.localeCompare(b.statutValidation))
      .map((g) => ({ label: LABELS[g.statutValidation] ?? g.statutValidation, total: g._count._all }));
  }

  const rows = await prisma.$queryRaw<Array<{ statut: string; total: bigint }>>`
    SELECT statut, total FROM vw_dossiers_par_statut WHERE workflow_type = 'VALIDATION' ORDER BY statut
  `;
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
  const session = await requirePermission("DASHBOARD_VIEW");
  const scope = await getSupervisorScope(session);

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

  // SUPERVISEUR (Phase 16+) : ne garder que ses opérateurs affectés — la
  // requête ci-dessus reste globale (petit volume, LEFT JOIN déjà filtré
  // par `total_dossiers > 0` côté vue), filtrage en mémoire plus simple
  // qu'une requête dédiée.
  const scoped = scope ? rows.filter((r) => scope.includes(r.operateur_id)) : rows;

  return scoped
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
  const session = await requirePermission("DASHBOARD_VIEW");

  const scope = await getSupervisorScope(session);
  if (scope) {
    const anomalies = await prisma.anomalie.findMany({
      where: { dossier: { operateurId: scope.length ? { in: scope } : -1 } },
      select: { createdAt: true },
    });
    const counts = new Map<string, number>();
    for (const a of anomalies) {
      const mois = a.createdAt.toISOString().slice(0, 7);
      counts.set(mois, (counts.get(mois) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mois, total]) => ({ mois, total }));
  }

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
  const session = await requirePermission("DASHBOARD_VIEW");
  const kpis = await getDashboardKpis(); // déjà scopé en interne pour un SUPERVISEUR

  const RETARD_SEUIL_JOURS = 30;
  const seuil = new Date();
  seuil.setDate(seuil.getDate() - RETARD_SEUIL_JOURS);

  const scope = await getSupervisorScope(session);
  const operateurFilter = scope ? scopeWhere(scope) : {};

  const [dossiersEnRetard, anomaliesCritiques] = await Promise.all([
    prisma.dossier.count({
      where: {
        statutArchivage: { not: "TERMINE" },
        statutValidation: { not: "REJETE" },
        updatedAt: { lt: seuil },
        ...operateurFilter,
      },
    }),
    prisma.anomalie.count({
      where: {
        gravite: "CRITIQUE",
        statut: "OUVERTE",
        ...(scope ? { dossier: { operateurId: scope.length ? { in: scope } : -1 } } : {}),
      },
    }),
  ]);

  return { ...kpis, dossiersEnRetard, anomaliesCritiques };
}

export interface CartonsDossiersEtatOverview {
  nombreCartons: number;
  nombreDossiers: number;
  nombreCartonsDegrades: number;
  nombreDossiersDegrades: number;
}

/**
 * Indicateurs état de conservation des cartons/dossiers (Phase 15+),
 * renseignés à la collecte (`etatCarton`/`etatDossier`, cf. schema.prisma).
 * `codeBarres` est unique par dossier — dans ce modèle un code-barres
 * identifie un carton unique, donc "nombre de cartons" = nombre de dossiers
 * avec un code-barres renseigné (pas besoin d'un groupBy distinct).
 */
export async function getCartonsDossiersEtatOverview(): Promise<CartonsDossiersEtatOverview> {
  const session = await requirePermission("DASHBOARD_VIEW");
  const scope = await getSupervisorScope(session);
  const base = scope ? scopeWhere(scope) : {};

  const [nombreCartons, nombreDossiers, nombreCartonsDegrades, nombreDossiersDegrades] = await Promise.all([
    prisma.dossier.count({ where: { ...base, codeBarres: { not: null } } }),
    prisma.dossier.count({ where: base }),
    prisma.dossier.count({ where: { ...base, codeBarres: { not: null }, etatCarton: "DEGRADE" } }),
    prisma.dossier.count({ where: { ...base, etatDossier: "DEGRADE" } }),
  ]);

  return { nombreCartons, nombreDossiers, nombreCartonsDegrades, nombreDossiersDegrades };
}
