import { requirePermission } from "@/lib/auth/current-user";
import {
  getQualityOverview,
  getScoreByOperateur,
  getScoreByCommune,
  listOpenAnomalies,
} from "@/lib/services/quality-service";
import { QualityScanButton } from "@/components/qualite/QualityScanButton";
import { AnomaliesTable } from "@/components/qualite/AnomaliesTable";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Copy, FileX2, ShieldAlert, ShieldCheck } from "lucide-react";

export const metadata = { title: "Contrôle qualité — GeoArchives-MULCV" };

export default async function QualitePage() {
  const session = await requirePermission("QUALITY_VIEW");
  const canUpdate = session.permissions.includes("QUALITY_UPDATE");
  const isSuperviseurRole = session.roleCode === "SUPERVISEUR";

  const [overview, byOperateur, byCommune, anomalies] = await Promise.all([
    getQualityOverview(),
    getScoreByOperateur(),
    getScoreByCommune(),
    listOpenAnomalies(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contrôle qualité"
        icon={ShieldCheck}
        title="Qualité des dossiers"
        description={
          <>
            Score = champs valides / champs contrôlés × 100. {isSuperviseurRole ? "Vue limitée aux opérateurs affectés." : "Vue globale du périmètre documentaire."}
          </>
        }
        actions={canUpdate ? <QualityScanButton /> : null}
        stats={[
          { label: "Score global", value: `${overview.scoreGlobal}%`, tone: "success" },
          { label: "Anomalies ouvertes", value: overview.totalAnomaliesOuvertes, tone: overview.totalAnomaliesOuvertes > 0 ? "warning" : "success" },
          { label: "Dossiers incomplets", value: overview.totalIncomplets, tone: overview.totalIncomplets > 0 ? "warning" : "success" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={ShieldCheck} label="Score qualité global" value={`${overview.scoreGlobal}%`} tone="success" />
        <KpiCard icon={AlertTriangle} label="Dossiers incomplets" value={overview.totalIncomplets} hint={`sur ${overview.totalDossiers}`} tone={overview.totalIncomplets > 0 ? "destructive" : "success"} />
        <KpiCard icon={Copy} label="Doublons détectés" value={overview.totalDoublonsCodeBarres + overview.totalDoublonsNumeroDirectionService} hint="code-barres + N° Direction/Service" tone="destructive" />
        <KpiCard icon={FileX2} label="Dossiers rejetés" value={overview.totalRejetes} tone="destructive" />
        <KpiCard icon={ShieldAlert} label="Anomalies ouvertes" value={overview.totalAnomaliesOuvertes} tone={overview.totalAnomaliesOuvertes > 0 ? "destructive" : "success"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score qualité par opérateur</CardTitle>
            <CardDescription>Triés du score le plus faible au plus élevé.</CardDescription>
          </CardHeader>
          <CardContent>
            {byOperateur.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-background/70 py-8 text-center text-sm text-muted-foreground">Aucune donnée.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead>Opérateur</TableHead>
                      <TableHead>Dossiers</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byOperateur.map((r) => (
                      <TableRow key={r.id} className="hover:bg-accent/30">
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="tabular-nums">{r.totalDossiers}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={r.score} className="w-28" />
                            <span className="text-xs font-medium tabular-nums">{r.score}%</span>
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

        <Card>
          <CardHeader>
            <CardTitle>Score qualité par commune</CardTitle>
            <CardDescription>Triés du score le plus faible au plus élevé.</CardDescription>
          </CardHeader>
          <CardContent>
            {byCommune.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-background/70 py-8 text-center text-sm text-muted-foreground">Aucune donnée.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border/70 bg-background/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead>Commune</TableHead>
                      <TableHead>Dossiers</TableHead>
                      <TableHead>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCommune.map((r) => (
                      <TableRow key={r.id} className="hover:bg-accent/30">
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="tabular-nums">{r.totalDossiers}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={r.score} className="w-28" />
                            <span className="text-xs font-medium tabular-nums">{r.score}%</span>
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

      <Card>
        <CardHeader>
          <CardTitle>Anomalies ouvertes</CardTitle>
          <CardDescription>
            {overview.totalAnomaliesOuvertes} anomalie{overview.totalAnomaliesOuvertes > 1 ? "s" : ""} à traiter.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnomaliesTable anomalies={anomalies} canResolve={canUpdate} />
        </CardContent>
      </Card>
    </div>
  );
}