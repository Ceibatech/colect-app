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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FolderKanban, FilePlus2, Send, ShieldQuestion, ShieldCheck, ShieldX,
  ScanLine, Tags, Archive, Gauge, Activity, AlertTriangle,
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par nature de dossier</CardTitle>
            <CardDescription>Lecture des typologies les plus représentées.</CardDescription>
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={byNature} colorByCategory />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par statut de validation</CardTitle>
            <CardDescription>Contrôle rapide des dossiers en anomalie ou validés.</CardDescription>
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={byStatut} colorByCategory />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>État de conservation des cartons et dossiers</CardTitle>
          <CardDescription>
            Renseigné à la collecte — un carton/dossier « Dégradé » porte une description de son état.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60">
                  <TableHead>Nbre de cartons</TableHead>
                  <TableHead>Nbre de dossiers</TableHead>
                  <TableHead>Nbre de cartons dégradés</TableHead>
                  <TableHead>Nbre de dossiers dégradés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="text-base font-semibold tabular-nums">{etatOverview.nombreCartons}</TableCell>
                  <TableCell className="text-base font-semibold tabular-nums">{etatOverview.nombreDossiers}</TableCell>
                  <TableCell className="text-base font-semibold tabular-nums">
                    {etatOverview.nombreCartonsDegrades > 0 ? (
                      <span className="text-destructive">{etatOverview.nombreCartonsDegrades}</span>
                    ) : (
                      etatOverview.nombreCartonsDegrades
                    )}
                  </TableCell>
                  <TableCell className="text-base font-semibold tabular-nums">
                    {etatOverview.nombreDossiersDegrades > 0 ? (
                      <span className="text-destructive">{etatOverview.nombreDossiersDegrades}</span>
                    ) : (
                      etatOverview.nombreDossiersDegrades
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
