"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { getClientIp } from "@/lib/utils/server-request";
import { scoreDossier, QUALITY_SCORE_SELECT } from "@/lib/services/quality-scoring";
import { getSupervisorScope, isOperateurInScope } from "@/lib/services/access-scope";
import type { AnomalieGravite, AnomalieType } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Phase 16+ : un SUPERVISEUR ne voit la qualité que des dossiers des
 * opérateurs qui lui sont affectés (même principe que dashboard-service.ts,
 * `getSupervisorScope()` partagée dans access-scope.ts — hors périmètre
 * pour OPERATEUR/ADMIN/CONSULTATION, comportement inchangé).
 */

/**
 * Mémoïsée par requête (Phase 14, §94) : `/qualite` (page.tsx) appelle
 * `getQualityOverview()`, `getScoreByOperateur()` et `getScoreByCommune()`
 * dans le même `Promise.all` — sans mémoïsation, chacune ré-interrogeait
 * indépendamment TOUS les dossiers en base et recalculait le score qualité
 * de chacun, soit 3 lectures + 3 recalculs identiques par affichage de la
 * page. `cache()` (fonction non exportée, autorisé dans un module
 * "use server" — seuls les exports doivent être async) réduit ça à un seul
 * appel réel, les deux suivants réutilisant le résultat pour ce rendu.
 */
const getScoredDossiers = cache(async (session: SessionPayload) => {
  const scope = await getSupervisorScope(session);
  const where = scope ? { operateurId: scope.length ? { in: scope } : -1 } : {};
  const dossiers = await prisma.dossier.findMany({ where, select: QUALITY_SCORE_SELECT });
  return dossiers.map((d) => ({
    ...d,
    scoreResult: scoreDossier(d, {
      includeDocumentCheck: d.statutNumerisation === "TERMINE",
      hasDocument: d._count.documents > 0,
    }),
  }));
});

export interface QualityOverview {
  totalDossiers: number;
  scoreGlobal: number;
  totalIncomplets: number; // score < 100
  totalRejetes: number;
  totalDoublonsCodeBarres: number;
  totalDoublonsNumeroDirectionService: number;
  totalAnomaliesOuvertes: number;
}

export async function getQualityOverview(): Promise<QualityOverview> {
  const session = await requirePermission("QUALITY_VIEW");
  const scope = await getSupervisorScope(session);
  const operateurWhere = scope ? { operateurId: scope.length ? { in: scope } : -1 } : {};

  const [scored, totalRejetes, doublonsCodeBarres, doublonsNumeroDirectionService, totalAnomaliesOuvertes] = await Promise.all([
    getScoredDossiers(session),
    prisma.dossier.count({ where: { statutValidation: "REJETE", ...operateurWhere } }),
    prisma.dossier.groupBy({
      by: ["codeBarres"],
      where: { codeBarres: { not: null }, ...operateurWhere },
      _count: { _all: true },
      having: { codeBarres: { _count: { gt: 1 } } },
    }),
    // "numeroDdu" est désormais une direction/service (liste fermée) —
    // partagée légitimement par de nombreux dossiers, ce n'est plus un
    // identifiant à détecter en doublon. Le doublon pertinent est
    // "numeroDirectionService" (référence propre à ce dossier au sein de
    // cette direction/service).
    prisma.dossier.groupBy({
      by: ["numeroDirectionService"],
      where: { numeroDirectionService: { not: null }, ...operateurWhere },
      _count: { _all: true },
      having: { numeroDirectionService: { _count: { gt: 1 } } },
    }),
    prisma.anomalie.count({ where: { statut: "OUVERTE", ...(scope ? { dossier: operateurWhere } : {}) } }),
  ]);

  const totalValid = scored.reduce((sum, d) => sum + d.scoreResult.validFields, 0);
  const totalControlled = scored.reduce((sum, d) => sum + d.scoreResult.totalFields, 0);
  const totalIncomplets = scored.filter((d) => d.scoreResult.score < 100).length;

  return {
    totalDossiers: scored.length,
    scoreGlobal: totalControlled > 0 ? Math.round((totalValid / totalControlled) * 100) : 0,
    totalIncomplets,
    totalRejetes,
    totalDoublonsCodeBarres: doublonsCodeBarres.length,
    totalDoublonsNumeroDirectionService: doublonsNumeroDirectionService.length,
    totalAnomaliesOuvertes,
  };
}

export interface ScoreByGroup {
  id: number;
  label: string;
  totalDossiers: number;
  score: number;
}

export async function getScoreByOperateur(): Promise<ScoreByGroup[]> {
  const session = await requirePermission("QUALITY_VIEW");
  const scored = await getScoredDossiers(session);
  const operateurs = await prisma.operateur.findMany({ select: { id: true, nom: true, prenoms: true } });

  return operateurs
    .map((op) => {
      const mine = scored.filter((d) => d.operateurId === op.id);
      const validSum = mine.reduce((s, d) => s + d.scoreResult.validFields, 0);
      const totalSum = mine.reduce((s, d) => s + d.scoreResult.totalFields, 0);
      return {
        id: op.id,
        label: `${op.nom} ${op.prenoms ?? ""}`.trim(),
        totalDossiers: mine.length,
        score: totalSum > 0 ? Math.round((validSum / totalSum) * 100) : 0,
      };
    })
    .filter((r) => r.totalDossiers > 0)
    .sort((a, b) => a.score - b.score);
}

export async function getScoreByCommune(): Promise<ScoreByGroup[]> {
  const session = await requirePermission("QUALITY_VIEW");
  const scored = await getScoredDossiers(session);
  const communes = await prisma.commune.findMany({ select: { id: true, nom: true } });

  return communes
    .map((c) => {
      const mine = scored.filter((d) => d.communeId === c.id);
      const validSum = mine.reduce((s, d) => s + d.scoreResult.validFields, 0);
      const totalSum = mine.reduce((s, d) => s + d.scoreResult.totalFields, 0);
      return {
        id: c.id,
        label: c.nom,
        totalDossiers: mine.length,
        score: totalSum > 0 ? Math.round((validSum / totalSum) * 100) : 0,
      };
    })
    .filter((r) => r.totalDossiers > 0)
    .sort((a, b) => a.score - b.score);
}

export interface OpenAnomalyRow {
  id: number;
  type: AnomalieType;
  gravite: AnomalieGravite;
  champ: string | null;
  description: string | null;
  createdAt: Date;
  dossier: { id: number; reference: string };
}

export async function listOpenAnomalies(limit = 100): Promise<OpenAnomalyRow[]> {
  const session = await requirePermission("QUALITY_VIEW");
  const scope = await getSupervisorScope(session);
  return prisma.anomalie.findMany({
    where: {
      statut: "OUVERTE",
      ...(scope ? { dossier: { operateurId: scope.length ? { in: scope } : -1 } } : {}),
    },
    orderBy: [{ gravite: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      type: true,
      gravite: true,
      champ: true,
      description: true,
      createdAt: true,
      dossier: { select: { id: true, reference: true } },
    },
  });
}

/**
 * Lance un contrôle qualité (§88). Pour chaque dossier scanné, crée un
 * `quality_checks` et ouvre une `anomalies` pour chaque problème détecté —
 * sans dupliquer une anomalie déjà ouverte pour le même dossier/type/champ.
 */
export async function runQualityScan(dossierId?: number): Promise<{ dossiersScanned: number; anomaliesCreated: number }> {
  const session = await requirePermission("QUALITY_UPDATE");

  if (dossierId) {
    const dossier = await prisma.dossier.findUnique({ where: { id: dossierId }, select: { operateurId: true } });
    if (dossier && !(await isOperateurInScope(session, dossier.operateurId))) {
      throw new Error("Vous ne pouvez lancer un contrôle que sur les dossiers des opérateurs qui vous sont affectés.");
    }
  }

  const scope = await getSupervisorScope(session);
  const where = dossierId
    ? { id: dossierId }
    : scope
      ? { operateurId: scope.length ? { in: scope } : -1 }
      : {};
  const dossiers = await prisma.dossier.findMany({
    where,
    select: { ...QUALITY_SCORE_SELECT, id: true },
  });

  const existingOpen = await prisma.anomalie.findMany({
    where: { statut: "OUVERTE", dossierId: dossierId ? dossierId : { in: dossiers.map((d) => d.id) } },
    select: { dossierId: true, type: true, champ: true },
  });
  const openKey = (dId: number, type: string, champ: string | null) => `${dId}:${type}:${champ ?? ""}`;
  const openSet = new Set(existingOpen.map((a) => openKey(a.dossierId, a.type, a.champ)));

  let anomaliesCreated = 0;

  for (const d of dossiers) {
    const result = scoreDossier(d, {
      includeDocumentCheck: d.statutNumerisation === "TERMINE",
      hasDocument: d._count.documents > 0,
    });

    const qc = await prisma.qualityCheck.create({
      data: {
        dossierId: d.id,
        userId: session.userId,
        typeControle: "CONTROLE_AUTOMATIQUE",
        score: result.score,
        statut: result.issues.length === 0 ? "CONFORME" : result.score >= 80 ? "A_CORRIGER" : "NON_CONFORME",
        nombreAnomalies: result.issues.length,
      },
    });

    const newIssues = result.issues.filter((issue) => !openSet.has(openKey(d.id, issue.type, issue.champ)));
    if (newIssues.length > 0) {
      await prisma.anomalie.createMany({
        data: newIssues.map((issue) => ({
          dossierId: d.id,
          qualityCheckId: qc.id,
          type: issue.type,
          champ: issue.champ,
          description: issue.description,
          gravite: issue.gravite,
          statut: "OUVERTE" as const,
        })),
      });
      anomaliesCreated += newIssues.length;
      for (const issue of newIssues) openSet.add(openKey(d.id, issue.type, issue.champ));
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "QUALITY_SCAN",
      entity: "DOSSIER",
      entityId: dossierId,
      newValue: { dossiersScanned: dossiers.length, anomaliesCreated },
      ipAddress: await getClientIp(),
    },
  });

  return { dossiersScanned: dossiers.length, anomaliesCreated };
}

export async function resolveAnomalie(id: number, commentaire?: string) {
  const session = await requirePermission("QUALITY_UPDATE");
  const anomalie = await prisma.anomalie.findUnique({ where: { id }, include: { dossier: { select: { operateurId: true } } } });
  if (!anomalie) throw new Error("Anomalie introuvable.");
  if (!(await isOperateurInScope(session, anomalie.dossier.operateurId))) {
    throw new Error("Vous ne pouvez traiter que les anomalies des opérateurs qui vous sont affectés.");
  }

  const updated = await prisma.anomalie.update({
    where: { id },
    data: { statut: "CORRIGEE", corrigePar: session.userId, corrigeLe: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "ANOMALIE_RESOLVE",
      entity: "ANOMALIE",
      entityId: id,
      newValue: commentaire ? { commentaire } : undefined,
      ipAddress: await getClientIp(),
    },
  });

  return updated;
}
