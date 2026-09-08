import type { ReactNode } from "react";
import { requirePermission } from "@/lib/auth/current-user";
import { getDirectionOverview, getAnomaliesEvolution } from "@/lib/services/dashboard-service";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { AnomaliesEvolutionChart } from "@/components/dashboard/AnomaliesEvolutionChart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeRate } from "@/lib/utils/rate";
import { cn } from "@/lib/utils";
import {
  Activity,
  Archive,
  Clock,
  FileCheck2,
  FolderKanban,
  Gauge,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Tags,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export const metadata = { title: "Dashboard Direction - GeoArchives-MULCV" };

type MetricTone = "default" | "success" | "warning" | "destructive";

const metricTones: Record<MetricTone, { bar: string; icon: string; value: string; surface: string }> = {
  default: {
    bar: "bg-primary",
    icon: "bg-primary/10 text-primary ring-primary/20",
    value: "text-foreground",
    surface: "border-primary/20 bg-primary/[0.035]",
  },
  success: {
    bar: "bg-brand-green",
    icon: "bg-brand-green/10 text-brand-green ring-brand-green/20",
    value: "text-brand-green",
    surface: "border-brand-green/25 bg-brand-green/[0.04]",
  },
  warning: {
    bar: "bg-brand-gold",
    icon: "bg-brand-gold/15 text-brand-gold ring-brand-gold/25",
    value: "text-brand-gold",
    surface: "border-brand-gold/30 bg-brand-gold/[0.045]",
  },
  destructive: {
    bar: "bg-destructive",
    icon: "bg-destructive/10 text-destructive ring-destructive/20",
    value: "text-destructive",
    surface: "border-destructive/25 bg-destructive/[0.04]",
  },
};

export default async function DashboardDirectionPage() {
  await requirePermission("DASHBOARD_VIEW");

  const [overview, anomaliesEvolution] = await Promise.all([getDirectionOverview(), getAnomaliesEvolution()]);

  const globalProgress = clampPercent(overview.tauxGlobal);
  const rejectionRate = computeRate(overview.rejetes, overview.total);
  const lateRate = computeRate(overview.dossiersEnRetard, overview.total);
  const backlog = Math.max(overview.total - overview.archives, 0);
  const riskCount = overview.rejetes + overview.dossiersEnRetard + overview.anomaliesCritiques;
  const riskTone: MetricTone = overview.anomaliesCritiques > 0 || overview.dossiersEnRetard > 0 ? "destructive" : "success";
  const healthTone: MetricTone = riskCount > 0 ? riskTone : globalProgress >= 70 ? "success" : "warning";
  const healthLabel =
    overview.anomaliesCritiques > 0
      ? "Risque critique actif"
      : overview.dossiersEnRetard > 0
        ? "Retards \u00e0 r\u00e9sorber"
        : globalProgress >= 70
          ? "Cadence solide"
          : "Mont\u00e9e en charge";

  const tauxParEtape = [
    { label: "Collecte", total: overview.tauxCollecte },
    { label: "Validation", total: overview.tauxValidation },
    { label: "Num\u00e9risation", total: overview.tauxNumerisation },
    { label: "Indexation", total: overview.tauxIndexation },
    { label: "Archivage", total: overview.tauxArchivage },
  ];

  const stageRows: Array<{ label: string; value: number; count: number; base: number; icon: LucideIcon; tone: MetricTone }> = [
    { label: "Collecte", value: overview.tauxCollecte, count: overview.soumis, base: overview.total, icon: FileCheck2, tone: "default" },
    { label: "Validation", value: overview.tauxValidation, count: overview.valides, base: overview.soumis, icon: ShieldCheck, tone: "success" },
    { label: "Num\u00e9risation", value: overview.tauxNumerisation, count: overview.numerises, base: overview.valides, icon: ScanLine, tone: "success" },
    { label: "Indexation", value: overview.tauxIndexation, count: overview.indexes, base: overview.numerises, icon: Tags, tone: "warning" },
    { label: "Archivage", value: overview.tauxArchivage, count: overview.archives, base: overview.indexes, icon: Archive, tone: "default" },
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="relative min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_18px_48px_rgba(16,24,40,0.08)]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/8 to-transparent" aria-hidden="true" />
        <div className="relative grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)] lg:p-6">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <TrendingUp className="h-4 w-4" />
              </span>
              <Badge variant="secondary" className="rounded-md border border-border/60 bg-background/80 uppercase tracking-[0.16em]">
                Pilotage ex&eacute;cutif
              </Badge>
              <Badge variant={healthTone === "destructive" ? "destructive" : "outline"} className="rounded-md bg-background/70">
                {healthLabel}
              </Badge>
            </div>

            <div className="max-w-5xl space-y-2">
              <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                Dashboard Direction
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                Vue consolid&eacute;e du chantier d&apos;archivage avec les signaux d&apos;ex&eacute;cution, les points de blocage et la progression r&eacute;elle du pipeline.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <CompactStat label="Total dossiers" value={overview.total} />
              <CompactStat label="Avancement" value={`${globalProgress}%`} tone="success" />
              <CompactStat label="Reste \u00e0 archiver" value={backlog} tone={backlog > 0 ? "warning" : "success"} />
            </div>
          </div>

          <div className={cn("min-w-0 rounded-lg border p-4 shadow-sm", metricTones[healthTone].surface)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Sant&eacute; op&eacute;rationnelle</p>
                <div className={cn("mt-2 text-4xl font-semibold tracking-tight tabular-nums", metricTones[healthTone].value)}>{globalProgress}%</div>
              </div>
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1", metricTones[healthTone].icon)}>
                <Activity className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", metricTones[healthTone].bar)} style={{ width: `${globalProgress}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <MiniSignal label="Rejets" value={`${rejectionRate}%`} />
              <MiniSignal label="Retards" value={`${lateRate}%`} />
              <MiniSignal label="Critiques" value={overview.anomaliesCritiques} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <DirectionMetric icon={FolderKanban} label="Total dossiers" value={overview.total} hint="Base active du programme" />
        <DirectionMetric icon={Gauge} label="Taux global" value={`${globalProgress}%`} hint={`${overview.archives} ${plural(overview.archives, "archiv\u00e9", "archiv\u00e9s")}`} tone="success" />
        <DirectionMetric icon={ShieldX} label="Dossiers rejet\u00e9s" value={overview.rejetes} hint={`${rejectionRate}% du total`} tone={overview.rejetes > 0 ? "destructive" : "success"} />
        <DirectionMetric icon={Clock} label="Dossiers en retard" value={overview.dossiersEnRetard} hint={`${lateRate}% sans mise \u00e0 jour +30 j`} tone={overview.dossiersEnRetard > 0 ? "destructive" : "success"} />
        <DirectionMetric icon={ShieldAlert} label="Anomalies critiques" value={overview.anomaliesCritiques} hint="Ouvertes \u00e0 traiter" tone={overview.anomaliesCritiques > 0 ? "destructive" : "success"} />
      </div>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>Progression par &eacute;tape</CardTitle>
              <CardDescription>Lecture rapide des cinq jalons cl&eacute;s du pipeline.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-md bg-background/70">
              {overview.archives}/{overview.total} archiv&eacute;s
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 lg:grid-cols-5">
            {stageRows.map((stage) => (
              <StageProgress key={stage.label} {...stage} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Taux par &eacute;tape</CardTitle>
                <CardDescription>Progression compar&eacute;e des jalons, en pourcentage.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70">
                Pipeline
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <RepartitionBarChart data={tauxParEtape} colorByCategory limit={5} height={260} leftAxisWidth={104} barSize={28} />
          </CardContent>
        </Card>

        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>&Eacute;volution des anomalies</CardTitle>
                <CardDescription>Volume mensuel des anomalies ouvertes.</CardDescription>
              </div>
              <Badge variant={overview.anomaliesCritiques > 0 ? "destructive" : "outline"} className="w-fit rounded-md bg-background/70">
                {overview.anomaliesCritiques > 0 ? "Action requise" : "Sous contr\u00f4le"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <AnomaliesEvolutionChart data={anomaliesEvolution} height={260} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DirectionMetric({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
}) {
  const style = metricTones[tone];

  return (
    <Card className={cn("relative min-w-0 bg-card/95 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(16,24,40,0.10)]", style.surface)}>
      <div className={cn("absolute inset-x-0 top-0 h-1", style.bar)} aria-hidden="true" />
      <CardContent className="flex min-h-[132px] items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-3">
          <div className={cn("text-3xl font-semibold leading-none tracking-tight tabular-nums", style.value)}>{value}</div>
          <div className="space-y-1">
            <div className="text-sm font-medium leading-5 text-foreground">{label}</div>
            {hint ? <div className="text-xs leading-5 text-muted-foreground">{hint}</div> : null}
          </div>
        </div>
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1", style.icon)}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function StageProgress({ label, value, count, base, icon: Icon, tone }: { label: string; value: number; count: number; base: number; icon: LucideIcon; tone: MetricTone }) {
  const pct = clampPercent(value);
  const style = metricTones[tone];

  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1", style.icon)}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">{count}/{base}</p>
          </div>
        </div>
        <span className={cn("text-sm font-semibold tabular-nums", style.value)}>{pct}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={`Progression ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn("h-full rounded-full", style.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CompactStat({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: MetricTone }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/70 p-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums", metricTones[tone].value)}>{value}</p>
    </div>
  );
}

function MiniSignal({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-background/70 px-2.5 py-2 ring-1 ring-border/60">
      <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function plural(value: number, singular: string, pluralLabel: string) {
  return value === 1 ? singular : pluralLabel;
}
