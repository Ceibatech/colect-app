import { requirePermission } from "@/lib/auth/current-user";
import { getOperateurPerformance } from "@/lib/services/dashboard-service";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, UsersRound } from "lucide-react";

export const metadata = { title: "Dashboard Opérateurs — GeoArchives-MULCV" };

export default async function DashboardOperateursPage() {
  await requirePermission("DASHBOARD_VIEW");
  const rows = await getOperateurPerformance();
  const leader = rows[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance"
        icon={UsersRound}
        title="Dashboard Opérateurs"
        description="Classement des opérateurs par progression des dossiers jusqu'à l'archivage final."
        stats={[
          { label: "Opérateurs actifs", value: rows.length },
          { label: "Meilleur score", value: leader ? `${leader.performance}%` : "—", tone: "success" },
          { label: "Dossiers archivés", value: rows.reduce((total, r) => total + r.archives, 0), tone: "success" },
          { label: "Anomalies", value: rows.reduce((total, r) => total + r.anomalies, 0), tone: "warning" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Classement des opérateurs</CardTitle>
          <CardDescription>Performance = dossiers archivés / dossiers de l&apos;opérateur × 100.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/80 bg-background/70 py-12 text-center text-sm text-muted-foreground">
              Aucun opérateur avec des dossiers.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
              <Table className="min-w-[980px]">
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
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
                    <TableRow key={r.id} className="hover:bg-accent/30">
                      <TableCell className="text-muted-foreground">
                        {i === 0 ? <Trophy className="h-4 w-4 text-brand-gold" /> : i + 1}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.operateur}</TableCell>
                      <TableCell className="tabular-nums">{r.collectes}</TableCell>
                      <TableCell className="tabular-nums">{r.soumis}</TableCell>
                      <TableCell className="tabular-nums">{r.valides}</TableCell>
                      <TableCell className="tabular-nums">{r.rejetes > 0 ? <Badge variant="destructive" className="rounded-md">{r.rejetes}</Badge> : r.rejetes}</TableCell>
                      <TableCell className="tabular-nums">{r.numerises}</TableCell>
                      <TableCell className="tabular-nums">{r.indexes}</TableCell>
                      <TableCell className="tabular-nums">{r.archives}</TableCell>
                      <TableCell className="tabular-nums">{r.anomalies > 0 ? <Badge variant="secondary" className="rounded-md">{r.anomalies}</Badge> : r.anomalies}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.performance} className="w-28" />
                          <span className="text-xs font-medium tabular-nums">{r.performance}%</span>
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
