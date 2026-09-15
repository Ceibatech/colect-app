import { requirePermission, requireRole } from "@/lib/auth/current-user";
import { getRepartitionByCommune, getRepartitionByLotissement } from "@/lib/services/dashboard-service";
import { RepartitionBarChart } from "@/components/dashboard/RepartitionBarChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPinned } from "lucide-react";

export const metadata = { title: "Répartition territoriale - GeoArchives-MULCV" };

export default async function DashboardGeographiePage() {
  const session = await requireRole("ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR", "CONSULTATION");
  await requirePermission("DASHBOARD_VIEW");

  const [byCommune, byLotissement] = await Promise.all([getRepartitionByCommune(), getRepartitionByLotissement()]);
  const total = byCommune.reduce((sum, item) => sum + item.total, 0);
  const topShare = total > 0 ? Math.round(((byCommune[0]?.total ?? 0) / total) * 100) : 0;
  const scopeLabel = session.roleCode === "SUPERVISEUR" ? "Périmètre équipe" : session.roleCode === "PMO" ? "Périmètre PMO" : "Périmètre global";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Pilotage territorial"
        icon={MapPinned}
        title="Répartition territoriale"
        description="Comparez les volumes documentaires par commune et lotissement."
        actions={<Badge variant="outline" className="rounded-md bg-background/80">{scopeLabel}</Badge>}
        stats={[
          { label: "Dossiers localisés", value: total },
          { label: "Communes actives", value: byCommune.length },
          { label: "Lotissements actifs", value: byLotissement.length },
          { label: "Zone principale", value: byCommune[0]?.label ?? "Aucune" },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Volumes par commune</CardTitle>
                <CardDescription>{byCommune.length} commune{byCommune.length > 1 ? "s" : ""} avec au moins un dossier.</CardDescription>
              </div>
              {byCommune[0] ? (
                <Badge variant="secondary" className="w-fit rounded-md">{byCommune[0].label} · {topShare}%</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <RepartitionBarChart data={byCommune} colorByCategory limit={byCommune.length} leftAxisWidth={120} barSize={18} />
          </CardContent>
        </Card>

        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Volumes par lotissement</CardTitle>
                <CardDescription>Les 10 secteurs les plus représentés dans le portefeuille.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70">Top 10</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <RepartitionBarChart data={byLotissement} leftAxisWidth={140} barSize={18} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
