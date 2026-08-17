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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FolderKanban, FilePlus2, Send, ShieldQuestion, ShieldCheck, ShieldX,
  ScanLine, Tags, Archive, Gauge,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Taux global d&apos;avancement (archivés / total) : <strong>{kpis.tauxGlobal}%</strong>
        </p>
      </div>

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
            <CardDescription>Collecte, validation, numérisation, indexation, archivage (§48 items 1-5).</CardDescription>
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
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={byNature} colorByCategory />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par statut de validation</CardTitle>
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
            Renseigné à la collecte (§40) — un carton/dossier « Dégradé » porte une description de son état.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nbre de cartons</TableHead>
                  <TableHead>Nbre de dossiers</TableHead>
                  <TableHead>Nbre de cartons dégradés</TableHead>
                  <TableHead>Nbre de dossiers dégradés</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-base font-medium">{etatOverview.nombreCartons}</TableCell>
                  <TableCell className="text-base font-medium">{etatOverview.nombreDossiers}</TableCell>
                  <TableCell className="text-base font-medium">
                    {etatOverview.nombreCartonsDegrades > 0 ? (
                      <span className="text-destructive">{etatOverview.nombreCartonsDegrades}</span>
                    ) : (
                      etatOverview.nombreCartonsDegrades
                    )}
                  </TableCell>
                  <TableCell className="text-base font-medium">
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
