import { requirePermission } from "@/lib/auth/current-user";
import { getOperateurPerformance, type OperateurPerformanceRow } from "@/lib/services/dashboard-service";
import { computePipelineScore, computeQualityScore } from "@/lib/utils/pipeline-score";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Archive,
  CheckCircle2,
  CircleGauge,
  Medal,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";

export const metadata = { title: "Performance opérateurs - GeoArchives-MULCV" };

const PIPELINE_LABELS = ["Soumission", "Validation", "Numérisation", "Indexation", "Archivage"];

export default async function DashboardOperateursPage() {
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

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Pilotage des équipes"
        icon={UsersRound}
        title="Performance opérationnelle"
        description="Lecture comparée de la progression, de la qualité et de la charge confiée à chaque opérateur."
        actions={
          <Badge variant="outline" className="rounded-md bg-background/80">
            <CircleGauge className="mr-1.5 h-3.5 w-3.5" />
            Indice consolidé sur 5 jalons
          </Badge>
        }
        stats={[
          { label: "Opérateurs suivis", value: rows.length },
          { label: "Portefeuille actif", value: totals.total },
          { label: "Indice pipeline", value: `${portfolioProgress}%`, tone: scoreTone(portfolioProgress) },
          { label: "Qualité portefeuille", value: `${portfolioQuality}%`, tone: qualityTone(portfolioQuality) },
        ]}
      />

      <Card className="overflow-hidden bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Classement opérationnel</CardTitle>
              <CardDescription>Le rang combine d&apos;abord l&apos;avancement du pipeline, puis la qualité et le volume archivé.</CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit rounded-md border border-border/60 bg-background/80">
              {totals.atRisk} {totals.atRisk === 1 ? "dossier à risque" : "dossiers à risque"}
            </Badge>
          </div>
        </CardHeader>

        {rows.length === 0 ? (
          <CardContent className="py-14 text-center">
            <UsersRound className="mx-auto h-9 w-9 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">Aucun portefeuille opérateur actif</p>
            <p className="mt-1 text-sm text-muted-foreground">Le classement apparaîtra dès qu&apos;un dossier sera attribué.</p>
          </CardContent>
        ) : (
          <>
            <div className="divide-y divide-border/60 xl:hidden">
              {rows.map((row, index) => (
                <OperatorMobileRow key={row.id} row={row} rank={index + 1} />
              ))}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow className="bg-muted/45 hover:bg-muted/45">
                    <TableHead className="w-16 pl-5">Rang</TableHead>
                    <TableHead className="min-w-56">Opérateur</TableHead>
                    <TableHead className="w-28">Portefeuille</TableHead>
                    <TableHead className="min-w-[390px]">Progression des jalons</TableHead>
                    <TableHead className="w-36">Qualité</TableHead>
                    <TableHead className="w-40">Vigilance</TableHead>
                    <TableHead className="w-40 pr-5 text-right">Indice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.id} className={cn("hover:bg-accent/25", index === 0 && "bg-brand-gold/[0.035]") }>
                      <TableCell className="pl-5"><RankMark rank={index + 1} /></TableCell>
                      <TableCell><OperatorIdentity row={row} /></TableCell>
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

        <Methodology />
      </Card>
    </div>
  );
}

function OperatorMobileRow({ row, rank }: { row: OperateurPerformanceRow; rank: number }) {
  return (
    <article className="space-y-5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <RankMark rank={rank} />
          <OperatorIdentity row={row} />
        </div>
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

function RankMark({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/12 text-brand-gold ring-1 ring-brand-gold/25" title="Premier du classement">
        <Trophy className="h-4 w-4" />
      </span>
    );
  }

  if (rank <= 3) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary ring-1 ring-primary/15" title={`Rang ${rank}`}>
        <Medal className="h-4 w-4" />
      </span>
    );
  }

  return <span className="block w-9 text-center text-sm font-semibold tabular-nums text-muted-foreground">{rank}</span>;
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

function Methodology() {
  return (
    <div className="border-t border-border/60 bg-muted/20 px-4 py-5 sm:px-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.8fr)_minmax(14rem,0.8fr)] lg:items-start">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            <CircleGauge className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">Méthode de calcul</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Une lecture comparable, même lorsque les portefeuilles ont des volumes différents.</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Indice pipeline</p>
          <p className="mt-1 text-sm font-medium leading-6 text-foreground">
            Somme des jalons atteints / (5 × dossiers attribués) × 100
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {PIPELINE_LABELS.map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />
                {label} · 20%
              </span>
            ))}
          </div>
        </div>

        <div className="lg:border-l lg:border-border/70 lg:pl-5">
          <p className="text-xs font-medium uppercase text-muted-foreground">Indice qualité</p>
          <p className="mt-1 text-sm leading-6 text-foreground">Part des dossiers sans rejet ni anomalie ouverte.</p>
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Archive className="h-3.5 w-3.5" />
            Le volume archivé départage les scores égaux.
          </p>
        </div>
      </div>
    </div>
  );
}

function executionLevel(value: number) {
  if (value >= 85) return { label: "Maîtrisé", className: "border-brand-green/25 bg-brand-green/8 text-brand-green" };
  if (value >= 65) return { label: "Avancé", className: "border-primary/25 bg-primary/8 text-primary" };
  if (value >= 40) return { label: "En progression", className: "border-brand-gold/30 bg-brand-gold/8 text-brand-gold" };
  if (value > 0) return { label: "À accélérer", className: "border-destructive/20 bg-destructive/5 text-destructive" };
  return { label: "À démarrer", className: "border-border bg-muted/50 text-muted-foreground" };
}

function scoreTone(value: number): "default" | "success" | "warning" | "destructive" {
  if (value >= 70) return "success";
  if (value >= 40) return "warning";
  return value > 0 ? "destructive" : "default";
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
