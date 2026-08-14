import { requirePermission } from "@/lib/auth/current-user";
import { getRepartitionByCommune, getRepartitionByLotissement } from "@/lib/services/dashboard-service";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MapPinned } from "lucide-react";

export const metadata = { title: "Dashboard Géographique — GeoArchives-MULCV" };

export default async function DashboardGeographiePage() {
  await requirePermission("DASHBOARD_VIEW");
  const [byCommune, byLotissement] = await Promise.all([getRepartitionByCommune(), getRepartitionByLotissement()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard Géographique</h1>
        <p className="text-sm text-muted-foreground">Analyse par commune et lotissement.</p>
      </div>

      <Alert>
        <MapPinned className="h-4 w-4" />
        <AlertTitle>Cartographie (SIG)</AlertTitle>
        <AlertDescription>
          Hors périmètre V1 (cahier des charges §51) — l&apos;architecture (référentiels commune/lotissement/îlot/lot déjà
          normalisés) permet une future intégration cartographique sans migration de schéma.
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
