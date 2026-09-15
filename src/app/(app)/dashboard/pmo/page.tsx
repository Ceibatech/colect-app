import Link from "next/link";
import { Archive, BriefcaseBusiness, ChevronRight, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { getPmoOverview } from "@/lib/services/pmo-service";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pilotage PMO - GeoArchives-MULCV" };

export default async function PmoDashboardPage() {
  const overview = await getPmoOverview();
  const { summary } = overview;

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Portefeuille PMO"
        icon={BriefcaseBusiness}
        title="Exécution du programme"
        description="Vue consolidée des équipes rattachées, de l'avancement documentaire et des points qui nécessitent un arbitrage."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/operateurs" className={cn(buttonVariants({ variant: "outline" }))}>Portefeuilles <ChevronRight /></Link>
            <Link href="/dashboard/direction" className={cn(buttonVariants({ variant: "default" }))}>Vue direction <ChevronRight /></Link>
          </div>
        }
        stats={[
          { label: "Superviseurs", value: summary.supervisorCount },
          { label: "Opérateurs", value: summary.operatorCount },
          { label: "Avancement", value: `${summary.progress}%`, tone: summary.progress >= 70 ? "success" : summary.progress > 0 ? "warning" : "default" },
          { label: "Dossiers à traiter", value: summary.atRisk, tone: summary.atRisk > 0 ? "destructive" : "success" },
        ]}
      />

      <section className="grid gap-3 border-y border-border/70 bg-card/60 px-3 py-4 sm:grid-cols-3 sm:px-4">
        <PipelineMetric label="Dossiers suivis" value={summary.total} detail="Portefeuille affecté" />
        <PipelineMetric label="Dossiers archivés" value={summary.archived} detail={summary.total ? `${Math.round((summary.archived / summary.total) * 100)}% du portefeuille` : "Aucun dossier"} icon="archive" />
        <PipelineMetric label="Qualité portefeuille" value={`${summary.quality}%`} detail="Sans rejet ni anomalie ouverte" tone={summary.quality >= 90 ? "success" : summary.quality >= 70 ? "warning" : "danger"} />
      </section>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>Superviseurs du périmètre</CardTitle><CardDescription>Les équipes avec risques actifs remontent en premier pour accélérer la décision.</CardDescription></div>
            <Badge variant="outline" className="w-fit rounded-md">{summary.archived}/{summary.total} archivés</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {overview.supervisors.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <UsersRound className="mx-auto h-9 w-9 text-muted-foreground/60" />
              <p className="mt-3 font-medium">Aucun superviseur affecté</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">Un administrateur doit rattacher au moins un superviseur à ce compte PMO depuis la gestion des utilisateurs.</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60 lg:hidden">
                {overview.supervisors.map((row) => (
                  <article key={row.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{row.name}</h2><p className="text-xs text-muted-foreground">{row.operatorCount} opérateur{row.operatorCount > 1 ? "s" : ""} · {row.total} dossiers</p></div><RiskBadge count={row.atRisk} /></div>
                    <div><div className="mb-1.5 flex justify-between text-xs"><span>Avancement</span><strong>{row.progress}%</strong></div><Progress value={row.progress} className="h-2" /></div>
                    <div className="grid grid-cols-3 gap-3 text-sm"><Metric label="Validés" value={row.validated} /><Metric label="Archivés" value={row.archived} /><Metric label="Qualité" value={`${row.quality}%`} /></div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto lg:block">
                <Table className="min-w-[900px]">
                  <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-5">Superviseur</TableHead><TableHead>Équipe</TableHead><TableHead>Portefeuille</TableHead><TableHead className="min-w-52">Avancement</TableHead><TableHead>Validés</TableHead><TableHead>Archivés</TableHead><TableHead>Qualité</TableHead><TableHead className="pr-5">Vigilance</TableHead></TableRow></TableHeader>
                  <TableBody>{overview.supervisors.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="pl-5 font-medium">{row.name}</TableCell><TableCell className="tabular-nums">{row.operatorCount}</TableCell><TableCell className="tabular-nums">{row.total}</TableCell>
                      <TableCell><div className="flex items-center gap-3"><Progress value={row.progress} className="h-1.5 flex-1" /><strong className="w-10 text-right tabular-nums">{row.progress}%</strong></div></TableCell>
                      <TableCell className="tabular-nums">{row.validated}</TableCell><TableCell className="tabular-nums">{row.archived}</TableCell><TableCell className="font-medium tabular-nums">{row.quality}%</TableCell><TableCell className="pr-5"><RiskBadge count={row.atRisk} /></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs leading-5 text-muted-foreground">Cette vue est limitée aux superviseurs explicitement affectés au compte PMO. Les barèmes et projections de rémunération restent réservés à Finance et à l&apos;administration.</p>
    </div>
  );
}

function PipelineMetric({ label, value, detail, icon, tone = "default" }: { label: string; value: number | string; detail: string; icon?: "archive"; tone?: "default" | "success" | "warning" | "danger" }) {
  const tones = { default: "text-primary", success: "text-brand-green", warning: "text-brand-gold", danger: "text-destructive" };
  return <div className="flex items-center gap-3 px-1 py-1"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon === "archive" ? <Archive className="h-4 w-4" /> : <BriefcaseBusiness className="h-4 w-4" />}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className={cn("text-xl font-semibold tabular-nums", tones[tone])}>{value}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>;
}

function RiskBadge({ count }: { count: number }) {
  return count > 0 ? <Badge variant="destructive" className="rounded-md"><ShieldAlert /> {count} à traiter</Badge> : <Badge variant="outline" className="rounded-md border-brand-green/30 text-brand-green"><ShieldCheck /> Maîtrisé</Badge>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}