import { requirePermission, requireRole } from "@/lib/auth/current-user";
import { getOperateurPerformance, type OperateurPerformanceRow } from "@/lib/services/dashboard-service";
import { computePipelineScore, computeQualityScore } from "@/lib/utils/pipeline-score";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Info,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export const metadata = { title: "Performance opérateurs - GeoArchives-MULCV" };

const PIPELINE_LABELS = ["Soumission", "Validation", "Numérisation", "Indexation", "Archivage"];

export default async function DashboardOperateursPage() {
  const session = await requireRole("ADMIN", "EXECUTIF", "SUPERVISEUR");
  await requirePermission("DASHBOARD_VIEW");

  const rows = await getOperateurPerformance();
  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      submitted: acc.submitted + row.soumis,
      validated: acc.validated + row.valides,
      digitized: acc.digitized + row.numerises,
      indexed: acc.indexed + row.indexes,
      archived: acc.archived + row.archives,
      atRisk: acc.atRisk + row.dossiersARisque,
    }),
    { total: 0, submitted: 0, validated: 0, digitized: 0, indexed: 0, archived: 0, atRisk: 0 },
  );
  const portfolioProgress = computePipelineScore(totals);
  const portfolioQuality = computeQualityScore(totals.total, totals.atRisk);
  const scopeLabel = session.roleCode === "SUPERVISEUR" ? "Mon équipe" : "Vue globale";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Pilotage des équipes"
        icon={UsersRound}
        title="Portefeuilles opérateurs"
        description="Suivez la charge, l'avancement et les points de vigilance de chaque portefeuille."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-md bg-background/80">{scopeLabel}</Badge>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Comprendre l'indice d'avancement"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                }
              />
              <TooltipContent>L&apos;indice synthétise l&apos;avancement sur les cinq étapes documentaires.</TooltipContent>
            </Tooltip>
          </div>
        }
        stats={[
          { label: "Opérateurs suivis", value: rows.length },
          { label: "Dossiers confiés", value: totals.total },
          { label: "Avancement", value: `${portfolioProgress}%`, tone: scoreTone(portfolioProgress) },
          { label: "Qualité", value: `${portfolioQuality}%`, tone: qualityTone(portfolioQuality) },
        ]}
      />

      <Card className="overflow-hidden bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Suivi des portefeuilles</CardTitle>
              <CardDescription>Repérez les dossiers qui nécessitent un accompagnement ou une action prioritaire.</CardDescription>
            </div>
            <Badge variant={totals.atRisk > 0 ? "destructive" : "secondary"} className="w-fit rounded-md">
              {totals.atRisk > 0
                ? `${totals.atRisk} ${totals.atRisk === 1 ? "dossier à traiter" : "dossiers à traiter"}`
                : "Aucun signal actif"}
            </Badge>
          </div>
        </CardHeader>

        {rows.length === 0 ? (
          <CardContent className="py-14 text-center">
            <UsersRound className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">Aucun portefeuille actif</p>
            <p className="mt-1 text-sm text-muted-foreground">Les opérateurs apparaîtront dès qu&apos;un dossier leur sera attribué.</p>
          </CardContent>
        ) : (
          <>
            <div className="divide-y divide-border/60 xl:hidden">
              {rows.map((row) => <OperatorMobileRow key={row.id} row={row} />)}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <Table className="min-w-[1040px]">
                <TableHeader>
                  <TableRow className="bg-muted/45 hover:bg-muted/45">
                    <TableHead className="min-w-56 pl-5">Opérateur</TableHead>
                    <TableHead className="w-28">Portefeuille</TableHead>
                    <TableHead className="min-w-[390px]">Progression</TableHead>
                    <TableHead className="w-36">Qualité</TableHead>
                    <TableHead className="w-44">Vigilance</TableHead>
                    <TableHead className="w-40 pr-5 text-right">Avancement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-accent/25">
                      <TableCell className="pl-5"><OperatorIdentity row={row} /></TableCell>
                      <TableCell>
                        <p className="text-lg font-semibold tabular-nums">{row.total}</p>
                        <p className="text-xs text-muted-foreground">dossiers confiés</p>
                      </TableCell>
                      <TableCell><PipelineBreakdown row={row} /></TableCell>
                      <TableCell><QualityMeter value={row.qualite} /></TableCell>
                      <TableCell><RiskSignal row={row} /></TableCell>
                      <TableCell className="pr-5"><ExecutionScore value={row.avancement} align="end" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function OperatorMobileRow({ row }: { row: OperateurPerformanceRow }) {
  return (
    <article className="space-y-5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <OperatorIdentity row={row} />
        <ExecutionScore value={row.avancement} align="end" />
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-border/60 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Portefeuille</p>
          <p className="mt-1 font-semibold tabular-nums">{row.total} dossiers</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Qualité</p>
          <QualityMeter value={row.qualite} compact />
        </div>
      </div>

      <PipelineBreakdown row={row} />
      <RiskSignal row={row} />
    </article>
  );
}

function OperatorIdentity({ row }: { row: OperateurPerformanceRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/15">
        {initials(row.nom)}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{row.nom}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Matricule {row.matricule}</p>
      </div>
    </div>
  );
}

function PipelineBreakdown({ row }: { row: OperateurPerformanceRow }) {
  const stages = [row.soumis, row.valides, row.numerises, row.indexes, row.archives];

  return (
    <div className="grid grid-cols-5 gap-2" aria-label={`Progression de ${row.nom}`}>
      {stages.map((value, index) => {
        const percent = row.total > 0 ? Math.round((value / row.total) * 100) : 0;
        return (
          <div key={PIPELINE_LABELS[index]} className="min-w-0">
            <div className="flex items-baseline justify-between gap-1">
              <span className="truncate text-[10px] font-medium uppercase text-muted-foreground">{PIPELINE_LABELS[index].slice(0, 3)}</span>
              <span className="text-xs font-semibold tabular-nums">{value}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" title={`${PIPELINE_LABELS[index]} : ${value}/${row.total}`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, percent)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QualityMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  return (
    <div className={cn("space-y-1.5", compact ? "mt-1" : "min-w-28")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("font-semibold tabular-nums", qualityText(value))}>{value}%</span>
        {!compact ? <span className="text-[10px] uppercase text-muted-foreground">sans risque</span> : null}
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

function RiskSignal({ row }: { row: OperateurPerformanceRow }) {
  if (row.dossiersARisque === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-green">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Aucun signal actif</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        <p className="font-semibold text-destructive">{row.dossiersARisque} {row.dossiersARisque === 1 ? "dossier" : "dossiers"}</p>
        <p className="text-xs text-muted-foreground">{row.rejetes} rejetés, {row.anomalies} alertes ouvertes</p>
      </div>
    </div>
  );
}

function ExecutionScore({ value, align = "start" }: { value: number; align?: "start" | "end" }) {
  const level = executionLevel(value);
  return (
    <div className={cn("flex flex-col gap-1.5", align === "end" && "items-end text-right")}>
      <span className="text-2xl font-semibold leading-none tabular-nums">{value}%</span>
      <Badge variant="outline" className={cn("w-fit rounded-md", level.className)}>{level.label}</Badge>
    </div>
  );
}

function executionLevel(value: number) {
  if (value >= 85) return { label: "Maîtrisé", className: "border-brand-green/25 bg-brand-green/8 text-brand-green" };
  if (value >= 65) return { label: "Avancé", className: "border-primary/25 bg-primary/8 text-primary" };
  if (value >= 40) return { label: "En progression", className: "border-brand-gold/30 bg-brand-gold/8 text-brand-gold" };
  if (value > 0) return { label: "Démarrage", className: "border-brand-gold/30 bg-brand-gold/8 text-brand-gold" };
  return { label: "À démarrer", className: "border-border bg-muted/50 text-muted-foreground" };
}

function scoreTone(value: number): "default" | "success" | "warning" {
  if (value >= 70) return "success";
  return value > 0 ? "warning" : "default";
}

function qualityTone(value: number): "default" | "success" | "warning" | "destructive" {
  if (value >= 90) return "success";
  if (value >= 70) return "warning";
  return value > 0 ? "destructive" : "default";
}

function qualityText(value: number) {
  if (value >= 90) return "text-brand-green";
  if (value >= 70) return "text-brand-gold";
  return "text-destructive";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "OP";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
