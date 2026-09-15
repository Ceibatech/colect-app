import type { LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import {
  getQualityOverview,
  getScoreByOperateur,
  getScoreByCommune,
  listOpenAnomalies,
  type ScoreByGroup,
} from "@/lib/services/quality-service";
import { computeRate } from "@/lib/utils/rate";
import { QualityScanButton } from "@/components/qualite/QualityScanButton";
import { AnomaliesTable } from "@/components/qualite/AnomaliesTable";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  CircleGauge,
  Files,
  FileWarning,
  MapPinned,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export const metadata = { title: "Conformité documentaire - GeoArchives-MULCV" };

type QualityTone = "default" | "success" | "warning" | "destructive";

const toneStyles: Record<QualityTone, { icon: string; value: string; progress: string }> = {
  default: {
    icon: "bg-primary/10 text-primary ring-primary/15",
    value: "text-primary",
    progress: "[&_[data-slot=progress-indicator]]:bg-primary",
  },
  success: {
    icon: "bg-brand-green/10 text-brand-green ring-brand-green/20",
    value: "text-brand-green",
    progress: "[&_[data-slot=progress-indicator]]:bg-brand-green",
  },
  warning: {
    icon: "bg-brand-gold/12 text-brand-gold ring-brand-gold/20",
    value: "text-brand-gold",
    progress: "[&_[data-slot=progress-indicator]]:bg-brand-gold",
  },
  destructive: {
    icon: "bg-destructive/8 text-destructive ring-destructive/15",
    value: "text-destructive",
    progress: "[&_[data-slot=progress-indicator]]:bg-destructive",
  },
};

export default async function QualitePage() {
  const session = await requirePermission("QUALITY_VIEW");
  const canUpdate = session.permissions.includes("QUALITY_UPDATE");
  const isSuperviseurRole = session.roleCode === "SUPERVISEUR";

  const [overview, byOperateur, byCommune, anomalies] = await Promise.all([
    getQualityOverview(),
    getScoreByOperateur(),
    getScoreByCommune(),
    listOpenAnomalies(),
  ]);

  const quality = qualityLevel(overview.scoreGlobal);
  const conformityRate = computeRate(overview.totalConformes, overview.totalDossiers);
  const priorityAnomalies = anomalies.filter((anomaly) => anomaly.gravite === "CRITIQUE" || anomaly.gravite === "ELEVEE").length;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Pilotage qualité"
        icon={ShieldCheck}
        title="Conformité documentaire"
        description={
          isSuperviseurRole
            ? "Priorisez les corrections sur les dossiers des opérateurs placés sous votre supervision."
            : "Mesurez la fiabilité du portefeuille et concentrez les équipes sur les corrections prioritaires."
        }
        actions={
          <>
            <Badge variant={quality.badgeVariant} className={cn("rounded-md", quality.badgeClass)}>{quality.label}</Badge>
            {canUpdate ? <QualityScanButton /> : null}
          </>
        }
      />

      <Card className="overflow-hidden bg-card/95">
        <CardContent className="p-0">
          <div className="grid lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
            <section className="border-b border-border/60 p-5 sm:p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Indice de conformité</p>
                  <p className={cn("mt-3 text-5xl font-semibold leading-none tabular-nums", toneStyles[quality.tone].value)}>{overview.scoreGlobal}%</p>
                </div>
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1", toneStyles[quality.tone].icon)}>
                  <CircleGauge className="h-5 w-5" />
                </span>
              </div>
              <Progress value={overview.scoreGlobal} className={cn("mt-5", toneStyles[quality.tone].progress)} />
              <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Dossiers entièrement conformes</span>
                <span className="font-semibold tabular-nums">{overview.totalConformes}/{overview.totalDossiers}</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {conformityRate}% du portefeuille ne nécessite aucune régularisation documentaire.
              </p>
            </section>

            <div className="grid sm:grid-cols-2">
              <QualitySignal
                icon={FileWarning}
                label="À régulariser"
                value={overview.totalIncomplets}
                hint={`sur ${overview.totalDossiers} dossiers`}
                tone={overview.totalIncomplets > 0 ? "warning" : "success"}
              />
              <QualitySignal
                icon={ShieldAlert}
                label="Alertes ouvertes"
                value={overview.totalAnomaliesOuvertes}
                hint={`${priorityAnomalies} de priorité élevée`}
                tone={overview.totalAnomaliesOuvertes > 0 ? "destructive" : "success"}
              />
              <QualitySignal
                icon={Files}
                label="Références dupliquées"
                value={overview.totalReferencesDupliquees}
                hint="Références dossier à vérifier"
                tone={overview.totalReferencesDupliquees > 0 ? "warning" : "success"}
              />
              <QualitySignal
                icon={AlertTriangle}
                label="Rejets à reprendre"
                value={overview.totalRejetes}
                hint="Décisions de validation"
                tone={overview.totalRejetes > 0 ? "destructive" : "success"}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground sm:px-6">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />Complétude des informations</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />Cohérence des formats</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-brand-green" />Présence documentaire</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <QualityRanking
          icon={UsersRound}
          title="Priorités par opérateur"
          description="Les portefeuilles à consolider apparaissent en premier."
          rows={byOperateur}
        />
        <QualityRanking
          icon={MapPinned}
          title="Vigilance territoriale"
          description="Repérez rapidement les communes nécessitant un accompagnement."
          rows={byCommune}
        />
      </div>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>File de remédiation</CardTitle>
              <CardDescription>Traitez les alertes les plus sensibles avant la prochaine étape du pipeline.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {priorityAnomalies > 0 ? <Badge variant="destructive" className="rounded-md">{priorityAnomalies} prioritaires</Badge> : null}
              <Badge variant="outline" className="rounded-md bg-background/70">{overview.totalAnomaliesOuvertes} ouvertes</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <AnomaliesTable anomalies={anomalies} canResolve={canUpdate} />
        </CardContent>
      </Card>
    </div>
  );
}

function QualitySignal({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: number; hint: string; tone: QualityTone }) {
  const style = toneStyles[tone];

  return (
    <div className="flex min-h-32 items-start justify-between gap-4 border-b border-border/60 p-4 last:border-b-0 sm:min-h-36 sm:border-r sm:p-5 sm:even:border-r-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
        <p className={cn("mt-3 text-3xl font-semibold leading-none tabular-nums", style.value)}>{value}</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", style.icon)}>
        <Icon className="h-4.5 w-4.5" />
      </span>
    </div>
  );
}

function QualityRanking({ icon: Icon, title, description, rows }: { icon: LucideIcon; title: string; description: string; rows: ScoreByGroup[] }) {
  return (
    <Card className="bg-card/95">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Aucune donnée disponible.</div>
        ) : (
          <ol className="divide-y divide-border/60">
            {rows.map((row, index) => {
              const level = qualityLevel(row.score);
              return (
                <li key={row.id} className="p-4 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{row.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{row.totalDossiers} {row.totalDossiers === 1 ? "dossier contrôlé" : "dossiers contrôlés"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={level.badgeVariant} className={cn("rounded-md", level.badgeClass)}>{level.label}</Badge>
                          <span className={cn("min-w-11 text-right font-semibold tabular-nums", toneStyles[level.tone].value)}>{row.score}%</span>
                        </div>
                      </div>
                      <Progress value={row.score} className={cn("mt-3", toneStyles[level.tone].progress)} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function qualityLevel(score: number): { label: string; tone: QualityTone; badgeVariant: "default" | "secondary" | "destructive" | "outline"; badgeClass: string } {
  if (score >= 95) return { label: "Conforme", tone: "success", badgeVariant: "outline", badgeClass: "border-brand-green/25 bg-brand-green/8 text-brand-green" };
  if (score >= 80) return { label: "Sous contrôle", tone: "default", badgeVariant: "outline", badgeClass: "border-primary/25 bg-primary/8 text-primary" };
  if (score >= 60) return { label: "À consolider", tone: "warning", badgeVariant: "outline", badgeClass: "border-brand-gold/30 bg-brand-gold/8 text-brand-gold" };
  return { label: "Prioritaire", tone: "destructive", badgeVariant: "destructive", badgeClass: "" };
}