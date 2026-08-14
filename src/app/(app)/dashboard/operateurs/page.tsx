import { requirePermission } from "@/lib/auth/current-user";
import { getOperateurPerformance } from "@/lib/services/dashboard-service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy } from "lucide-react";

export const metadata = { title: "Dashboard Opérateurs — GeoArchives-MULCV" };

export default async function DashboardOperateursPage() {
  await requirePermission("DASHBOARD_VIEW");
  const rows = await getOperateurPerformance();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard Opérateurs</h1>
        <p className="text-sm text-muted-foreground">
          Performance = dossiers archivés / dossiers de l&apos;opérateur × 100. Classement décroissant.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classement des opérateurs</CardTitle>
          <CardDescription>{rows.length} opérateur(s) actif(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun opérateur avec des dossiers.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Opérateur</TableHead>
                    <TableHead>Collectés</TableHead>
                    <TableHead>Soumis</TableHead>
                    <TableHead>Validés</TableHead>
                    <TableHead>Rejetés</TableHead>
                    <TableHead>Numérisés</TableHead>
                    <TableHead>Indexés</TableHead>
                    <TableHead>Archivés</TableHead>
                    <TableHead>Anomalies</TableHead>
                    <TableHead>Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground">
                        {i === 0 ? <Trophy className="h-4 w-4 text-chart-4" /> : i + 1}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.operateur}</TableCell>
                      <TableCell>{r.collectes}</TableCell>
                      <TableCell>{r.soumis}</TableCell>
                      <TableCell>{r.valides}</TableCell>
                      <TableCell>{r.rejetes > 0 ? <Badge variant="destructive">{r.rejetes}</Badge> : r.rejetes}</TableCell>
                      <TableCell>{r.numerises}</TableCell>
                      <TableCell>{r.indexes}</TableCell>
                      <TableCell>{r.archives}</TableCell>
                      <TableCell>{r.anomalies > 0 ? <Badge variant="secondary">{r.anomalies}</Badge> : r.anomalies}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.performance} className="w-24" />
                          <span className="text-xs tabular-nums">{r.performance}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
