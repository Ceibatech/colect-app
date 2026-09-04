import { requirePermission } from "@/lib/auth/current-user";
import { getRepartitionByCommune, getRepartitionByLotissement } from "@/lib/services/dashboard-service";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPinned } from "lucide-react";

export const metadata = { title: "Dashboard Géographique — GeoArchives-MULCV" };

export default async function DashboardGeographiePage() {
  await requirePermission("DASHBOARD_VIEW");
  const [byCommune, byLotissement] = await Promise.all([getRepartitionByCommune(), getRepartitionByLotissement()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Territoire"
        icon={MapPinned}
        title="Dashboard Géographique"
        description="Lecture des volumes documentaires par commune et lotissement pour prioriser les zones à suivre."
        stats={[
          { label: "Communes", value: byCommune.length },
          { label: "Lotissements", value: byLotissement.length },
          { label: "Top commune", value: byCommune[0]?.label ?? "—" },
        ]}
      />

      <Alert className="border-primary/20 bg-primary/5">
        <MapPinned className="h-4 w-4 text-primary" />
        <AlertTitle>Cartographie SIG prête à intégrer</AlertTitle>
        <AlertDescription>
          L&apos;architecture des référentiels commune, lotissement, îlot et lot permet une future intégration cartographique sans migration de schéma.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Répartition par commune</CardTitle>
            <CardDescription>{byCommune.length} commune(s) avec au moins un dossier.</CardDescription>
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={byCommune} colorByCategory limit={byCommune.length} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Répartition par lotissement</CardTitle>
            <CardDescription>{byLotissement.length} lotissement(s) avec au moins un dossier — 10 premiers affichés.</CardDescription>
          </CardHeader>
          <CardContent>
            <RepartitionBarChart data={byLotissement} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
