import { requirePermission } from "@/lib/auth/current-user";
import {
  getQualityOverview,
  getScoreByOperateur,
  getScoreByCommune,
  listOpenAnomalies,
} from "@/lib/services/quality-service";
import { QualityScanButton } from "@/components/qualite/QualityScanButton";
import { AnomaliesTable } from "@/components/qualite/AnomaliesTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Copy, FileX2, ShieldAlert, ShieldCheck } from "lucide-react";

export const metadata = { title: "Contrôle qualité — GeoArchives-MULCV" };

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function QualitePage() {
  const session = await requirePermission("QUALITY_VIEW");
  const canUpdate = session.permissions.includes("QUALITY_UPDATE");

  const [overview, byOperateur, byCommune, anomalies] = await Promise.all([
    getQualityOverview(),
    getScoreByOperateur(),
    getScoreByCommune(),
    listOpenAnomalies(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Contrôle qualité</h1>
          <p className="text-sm text-muted-foreground">
            Score = champs valides / champs contrôlés × 100 (fiche CG1020 — voir DATABASE.md).
          </p>
        </div>
        {canUpdate && <QualityScanButton />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={ShieldCheck} label="Score qualité global" value={`${overview.scoreGlobal}%`} />
        <KpiCard icon={AlertTriangle} label="Dossiers incomplets" value={overview.totalIncomplets} hint={`sur ${overview.totalDossiers}`} />
        <KpiCard icon={Copy} label="Doublons détectés" value={overview.totalDoublonsCodeBarres + overview.totalDoublonsNumeroDdu} hint="code-barres + N° DDU" />
        <KpiCard icon={FileX2} label="Dossiers rejetés" value={overview.totalRejetes} />
        <KpiCard icon={ShieldAlert} label="Anomalies ouvertes" value={overview.totalAnomaliesOuvertes} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Score qualité par opérateur</CardTitle>
            <CardDescription>Triés du score le plus faible au plus élevé.</CardDescription>
          </CardHeader>
          <CardContent>
            {byOperateur.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opérateur</TableHead>
                    <TableHead>Dossiers</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byOperateur.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell>{r.totalDossiers}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.score} className="w-24" />
                          <span className="text-xs tabular-nums">{r.score}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              <p className="text-sm text-muted-foreground">Aucune donnée.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commune</TableHead>
                    <TableHead>Dossiers</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCommune.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell>{r.totalDossiers}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.score} className="w-24" />
                          <span className="text-xs tabular-nums">{r.score}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
