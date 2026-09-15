import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import {
  getDashboardKpis,
  getPipelineEvolution,
  getPipelineFunnel,
  getRepartitionByNature,
  getRepartitionByStatut,
  getCartonsDossiersEtatOverview,
} from "@/lib/services/dashboard-service";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PipelineEvolutionChart } from "@/components/dashboard/PipelineEvolutionChart";
import { PipelineFunnelChart } from "@/components/dashboard/PipelineFunnelChart";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoleCode } from "@/lib/permissions/constants";
import {
  FolderKanban, FilePlus2, Send, ShieldQuestion, ShieldCheck, ShieldX,
  ScanLine, Tags, Archive, Gauge, Activity, AlertTriangle, Boxes, Files,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

export const metadata = { title: "Tableau de bord - GeoArchives-MULCV" };

const DASHBOARD_COPY: Record<RoleCode, { eyebrow: string; title: string; description: string; progress: string }> = {
  ADMIN: {
    eyebrow: "Vue organisation",
    title: "Tableau de bord",
    description: "Suivi consolidé de l'activité documentaire, de la collecte à l'archivage final.",
    progress: "Avancement global",
  },
  SUPERVISEUR: {
    eyebrow: "Périmètre équipe",
    title: "Activité de mon équipe",
    description: "Suivi des dossiers confiés aux opérateurs de votre équipe et des actions à prioriser.",
    progress: "Avancement de l'équipe",
  },
  OPERATEUR: {
    eyebrow: "Espace opérateur",
    title: "Mon activité",
    description: "Retrouvez vos dossiers en cours, les retours à traiter et votre progression.",
    progress: "Mon avancement",
  },
  FINANCE: {
    eyebrow: "Pilotage financier",
    title: "Activité et budget",
    description: "Suivez les volumes acceptés, les points acquis et la projection budgétaire du programme.",
    progress: "Avancement du programme",
  },
  PMO: {
    eyebrow: "Pilotage PMO",
    title: "Portefeuille PMO",
    description: "Suivez la progression, la qualité et les risques du périmètre qui vous est confié.",
    progress: "Avancement du périmètre",
  },
  EXECUTIF: {
    eyebrow: "Vue exécutive",
    title: "Pilotage exécutif",
    description: "Lecture globale de la performance, des risques et de la progression du programme documentaire.",
    progress: "Avancement du programme",
  },
  CONSULTATION: {
    eyebrow: "Vue de consultation",
    title: "Synthèse documentaire",
    description: "Lecture consolidée de la progression et de l'état du portefeuille documentaire.",
    progress: "Avancement global",
  },
};

export default async function DashboardPage() {
  const session = await requirePermission("DASHBOARD_VIEW");
  const isOperator = session.roleCode === "OPERATEUR";
  const isExecutive = session.roleCode === "EXECUTIF";
  const dashboardScopeLabel = session.roleCode === "PMO" ? "Lecture seule · Périmètre PMO" : session.roleCode === "FINANCE" ? "Lecture globale · Données financières protégées" : null;
  const copy = DASHBOARD_COPY[session.roleCode];

  const distributionsPromise = isOperator
    ? null
    : Promise.all([getRepartitionByNature(), getRepartitionByStatut()]);
  const [kpis, evolution, funnel, etatOverview] = await Promise.all([
    getDashboardKpis(),
    getPipelineEvolution(),
    getPipelineFunnel(),
    getCartonsDossiersEtatOverview(),
  ]);
  const [byNature, byStatut] = distributionsPromise ? await distributionsPromise : [[], []];

  const progress = Math.min(Math.max(kpis.tauxGlobal, 0), 100);
  const degradedTotal = etatOverview.nombreCartonsDegrades + etatOverview.nombreDossiersDegrades;
  const drafts = Math.max(kpis.total - kpis.soumis, 0);
  const highlights = isOperator
    ? [
        { label: "Brouillons", value: drafts, icon: FilePlus2, tone: "default" as const },
        { label: "En contrôle", value: kpis.enControle, icon: ShieldQuestion, tone: "default" as const },
        { label: "À reprendre", value: kpis.rejetes, icon: ShieldX, tone: "destructive" as const },
      ]
    : [
        { label: "À contrôler", value: kpis.enControle, icon: Activity, tone: "default" as const },
        { label: "Rejets", value: kpis.rejetes, icon: ShieldX, tone: "destructive" as const },
        { label: "Dégradés", value: degradedTotal, icon: AlertTriangle, tone: "warning" as const },
      ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-[0_16px_50px_rgba(16,24,40,0.07)]">
          <div className="h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" aria-hidden="true" />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md border border-border/60 bg-muted/70 uppercase tracking-[0.16em]">
                {copy.eyebrow}
              </Badge>
              {isExecutive || dashboardScopeLabel ? (
                <Badge variant="outline" className="rounded-md bg-background/70 text-xs font-medium text-muted-foreground">
                  {isExecutive ? "Lecture seule · Périmètre global" : dashboardScopeLabel}
                </Badge>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  {isOperator ? session.name : "Collecte · Validation · Numérisation · Indexation · Archivage"}
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.description}</p>
                {isOperator ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href="/collecte/nouveau" className={buttonVariants({ size: "sm" })}>
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Nouvelle collecte
                    </Link>
                    <Link href="/dossiers" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <FolderOpen className="mr-2 h-4 w-4" />
                      Mes dossiers
                    </Link>
                  </div>
                ) : null}
              </div>

              <div className="min-w-52 rounded-lg border border-border/70 bg-background/70 p-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-muted-foreground">{copy.progress}</span>
                  <span className="text-xl font-semibold tabular-nums text-primary">{kpis.tauxGlobal}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {highlights.map((item) => <HighlightMetric key={item.label} {...item} />)}
        </div>
      </section>

      {isOperator ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard icon={FolderKanban} label="Mes dossiers" value={kpis.total} />
          <KpiCard icon={FilePlus2} label="Brouillons" value={drafts} />
          <KpiCard icon={Send} label="Soumis" value={kpis.soumis} hint={`${kpis.tauxCollecte}%`} />
          <KpiCard icon={ShieldX} label="À reprendre" value={kpis.rejetes} tone={kpis.rejetes > 0 ? "destructive" : "success"} />
          <KpiCard icon={Archive} label="Archivés" value={kpis.archives} hint={`${kpis.tauxArchivage}%`} tone="success" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard icon={FolderKanban} label="Total dossiers" value={kpis.total} />
          <KpiCard icon={FilePlus2} label="Collectés" value={kpis.collectes} hint={`${kpis.tauxCollecte}%`} />
          <KpiCard icon={Send} label="Soumis" value={kpis.soumis} />
          <KpiCard icon={ShieldQuestion} label="En contrôle" value={kpis.enControle} />
          <KpiCard icon={ShieldCheck} label="Validés" value={kpis.valides} hint={`${kpis.tauxValidation}%`} tone="success" />
          <KpiCard icon={ShieldX} label="Rejetés" value={kpis.rejetes} tone="destructive" />
          <KpiCard icon={ScanLine} label="Numérisés" value={kpis.numerises} hint={`${kpis.tauxNumerisation}%`} />
          <KpiCard icon={Tags} label="Indexés" value={kpis.indexes} hint={`${kpis.tauxIndexation}%`} />
          <KpiCard icon={Archive} label="Archivés" value={kpis.archives} hint={`${kpis.tauxArchivage}%`} tone="success" />
          <KpiCard icon={Gauge} label="Taux global" value={`${kpis.tauxGlobal}%`} />
        </div>
      )}

      <div className={isOperator ? "grid gap-4 xl:grid-cols-2" : "grid gap-4 lg:grid-cols-3"}>
        <Card className={isOperator ? "min-w-0 bg-card/95" : "min-w-0 bg-card/95 lg:col-span-2"}>
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>{isOperator ? "Mon activité récente" : "Évolution mensuelle du pipeline"}</CardTitle>
            <CardDescription>
              {isOperator ? "Progression mensuelle de vos dossiers." : "Volumes traités à chaque étape du cycle documentaire."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <PipelineEvolutionChart data={evolution} />
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>{isOperator ? "Progression de mes dossiers" : "Progression du portefeuille"}</CardTitle>
            <CardDescription>Dossiers ayant atteint chaque étape.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <PipelineFunnelChart data={funnel} />
          </CardContent>
        </Card>
      </div>

      {!isOperator ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="min-w-0 bg-card/95">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>Répartition par nature de dossier</CardTitle>
                  <CardDescription>Typologies les plus représentées dans le portefeuille.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit rounded-md bg-background/70">Top catégories</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <RepartitionBarChart data={byNature} colorByCategory leftAxisWidth={168} barSize={14} />
            </CardContent>
          </Card>

          <Card className="min-w-0 bg-card/95">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>Statuts de validation</CardTitle>
                  <CardDescription>Volumes en attente, en contrôle, validés ou rejetés.</CardDescription>
                </div>
                <Badge variant={kpis.rejetes > 0 ? "destructive" : "outline"} className="w-fit rounded-md">
                  {kpis.rejetes > 0 ? "Rejets à traiter" : "Flux maîtrisé"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <RepartitionBarChart data={byStatut} colorByCategory leftAxisWidth={132} barSize={14} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card className="min-w-0 bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>{isOperator ? "État de mes dossiers" : "État de conservation"}</CardTitle>
              <CardDescription>
                {isOperator ? "État déclaré lors de vos collectes." : "Lecture consolidée des cartons et dossiers déclarés à la collecte."}
              </CardDescription>
            </div>
            <Badge variant={degradedTotal > 0 ? "destructive" : "outline"} className="w-fit rounded-md">
              {degradedTotal > 0 ? "Éléments dégradés détectés" : "Aucune dégradation"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ConservationMetric icon={Boxes} label="Cartons inventoriés" value={etatOverview.nombreCartons} />
            <ConservationMetric icon={Files} label="Dossiers inventoriés" value={etatOverview.nombreDossiers} />
            <ConservationMetric icon={AlertTriangle} label="Cartons dégradés" value={etatOverview.nombreCartonsDegrades} alert={etatOverview.nombreCartonsDegrades > 0} />
            <ConservationMetric icon={AlertTriangle} label="Dossiers dégradés" value={etatOverview.nombreDossiersDegrades} alert={etatOverview.nombreDossiersDegrades > 0} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HighlightMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "default" | "warning" | "destructive";
}) {
  const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-brand-gold" : "text-primary";
  return (
    <div className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
    </div>
  );
}

function ConservationMetric({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: typeof Boxes;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-background/60 p-4">
      <span className={
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 " +
        (alert ? "bg-destructive/10 text-destructive ring-destructive/20" : "bg-primary/10 text-primary ring-primary/20")
      }>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className={"text-2xl font-semibold leading-none tabular-nums " + (alert ? "text-destructive" : "text-foreground")}>{value}</p>
        <p className="mt-1.5 text-xs font-medium leading-4 text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
