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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FolderKanban, FilePlus2, Send, ShieldQuestion, ShieldCheck, ShieldX,
  ScanLine, Tags, Archive, Gauge, Activity, AlertTriangle, Boxes, Files,
} from "lucide-react";

export const metadata = { title: "Tableau de bord — GeoArchives-MULCV" };

export default async function DashboardPage() {
  await requirePermission("DASHBOARD_VIEW");

  const [kpis, evolution, funnel, byNature, byStatut, etatOverview] = await Promise.all([
    getDashboardKpis(),
    getPipelineEvolution(),
    getPipelineFunnel(),
    getRepartitionByNature(),
    getRepartitionByStatut(),
    getCartonsDossiersEtatOverview(),
  ]);

  const progress = Math.min(Math.max(kpis.tauxGlobal, 0), 100);
  const degradedTotal = etatOverview.nombreCartonsDegrades + etatOverview.nombreDossiersDegrades;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-[0_16px_50px_rgba(16,24,40,0.07)]">
          <div className="h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" aria-hidden="true" />
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md border border-border/60 bg-muted/70 uppercase tracking-[0.16em]">
                Vue consolidée
              </Badge>
              <span className="text-xs font-medium text-muted-foreground">Collecte · Validation · Numérisation · Indexation · Archivage</span>
            </div>
            <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tableau de bord</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Suivi opérationnel des dossiers et de leur progression jusqu&apos;à l&apos;archivage final.
                </p>
              </div>
              <div className="min-w-48 rounded-lg border border-border/70 bg-background/70 p-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-muted-foreground">Avancement global</span>
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
          <div className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">À contrôler</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{kpis.enControle}</p>
              </div>
              <Activity className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Rejets</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">{kpis.rejetes}</p>
              </div>
              <ShieldX className="h-5 w-5 text-destructive" />
            </div>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Dégradés</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-brand-gold">{degradedTotal}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-brand-gold" />
            </div>
          </div>
        </div>
      </section>

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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Évolution mensuelle du pipeline</CardTitle>
            <CardDescription>Collecte, validation, numérisation, indexation, archivage.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineEvolutionChart data={evolution} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pipeline global</CardTitle>
            <CardDescription>Dossiers ayant atteint chaque étape.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineFunnelChart data={funnel} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Répartition par nature de dossier</CardTitle>
                <CardDescription>Classement des typologies les plus représentées.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70">
                Top catégories
              </Badge>
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
                <CardTitle>Répartition par statut de validation</CardTitle>
                <CardDescription>Lecture immédiate des volumes à contrôler ou validés.</CardDescription>
              </div>
              <Badge variant={kpis.rejetes > 0 ? "destructive" : "outline"} className="w-fit rounded-md bg-background/70">
                {kpis.rejetes > 0 ? "Rejets à traiter" : "Flux maîtrisé"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <RepartitionBarChart data={byStatut} colorByCategory leftAxisWidth={132} barSize={14} />
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 bg-card/95">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <CardTitle>État de conservation</CardTitle>
              <CardDescription>Lecture consolidée des cartons et dossiers déclarés à la collecte.</CardDescription>
            </div>
            <Badge variant={degradedTotal > 0 ? "destructive" : "outline"} className="w-fit rounded-md bg-background/70">
              {degradedTotal > 0 ? "Éléments dégradés détectés" : "Aucune dégradation"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ConservationMetric icon={Boxes} label="Cartons inventoriés" value={etatOverview.nombreCartons} />
            <ConservationMetric icon={Files} label="Dossiers inventoriés" value={etatOverview.nombreDossiers} />
            <ConservationMetric
              icon={AlertTriangle}
              label="Cartons dégradés"
              value={etatOverview.nombreCartonsDegrades}
              alert={etatOverview.nombreCartonsDegrades > 0}
            />
            <ConservationMetric
              icon={AlertTriangle}
              label="Dossiers dégradés"
              value={etatOverview.nombreDossiersDegrades}
              alert={etatOverview.nombreDossiersDegrades > 0}
            />
          </div>
        </CardContent>
      </Card>
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
      <span
        className={
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 " +
          (alert
            ? "bg-destructive/10 text-destructive ring-destructive/20"
            : "bg-primary/10 text-primary ring-primary/20")
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className={"text-2xl font-semibold leading-none tabular-nums " + (alert ? "text-destructive" : "text-foreground")}>
          {value}
        </p>
        <p className="mt-1.5 text-xs font-medium leading-4 text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
