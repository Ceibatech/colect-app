import { requirePermission } from "@/lib/auth/current-user";
import { getDirectionOverview, getAnomaliesEvolution } from "@/lib/services/dashboard-service";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { AnomaliesEvolutionChart } from "@/components/dashboard/AnomaliesEvolutionChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gauge, ShieldX, Clock, ShieldAlert, FolderKanban } from "lucide-react";

export const metadata = { title: "Dashboard Direction — GeoArchives-MULCV" };

export default async function DashboardDirectionPage() {
  await requirePermission("DASHBOARD_VIEW");

  const [overview, anomaliesEvolution] = await Promise.all([getDirectionOverview(), getAnomaliesEvolution()]);

  const tauxParEtape = [
    { label: "Collecte", total: overview.tauxCollecte },
    { label: "Validation", total: overview.tauxValidation },
    { label: "Numérisation", total: overview.tauxNumerisation },
    { label: "Indexation", total: overview.tauxIndexation },
    { label: "Archivage", total: overview.tauxArchivage },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard Direction</h1>
        <p className="text-sm text-muted-foreground">Vue synthétique de l&apos;avancement du chantier d&apos;archivage.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FolderKanban} label="Total dossiers" value={overview.total} />
        <KpiCard icon={Gauge} label="Taux global d'avancement" value={`${overview.tauxGlobal}%`} hint="archivés / total" tone="success" />
        <KpiCard icon={ShieldX} label="Dossiers rejetés" value={overview.rejetes} tone="destructive" />
        <KpiCard icon={Clock} label="Dossiers en retard" value={overview.dossiersEnRetard} hint="+30 j sans mise à jour" tone="destructive" />
        <KpiCard icon={ShieldAlert} label="Anomalies critiques" value={overview.anomaliesCritiques} tone="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Taux par étape</CardTitle>
            <CardDescription>Formules détaillées dans DATABASE.md / ARCHITECTURE.md (§47).</CardDescription>
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={tauxParEtape} colorByCategory limit={5} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Évolution des anomalies</CardTitle>
            <CardDescription>Nombre d&apos;anomalies ouvertes par mois de détection.</CardDescription>
          </CardHeader>
          <CardContent>
            <AnomaliesEvolutionChart data={anomaliesEvolution} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
