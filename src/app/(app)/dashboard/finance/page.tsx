import Link from "next/link";
import { CalendarDays, CircleDollarSign, Download, Info, WalletCards } from "lucide-react";
import { getFinanceDashboardData } from "@/lib/services/finance-service";
import { FinanceRateDialog } from "@/components/finance/FinanceRateDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pilotage financier - GeoArchives-MULCV" };

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const data = await getFinanceDashboardData(month);
  const money = currencyFormatter(data.summary.currency);


  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Pilotage financier"
        icon={WalletCards}
        title="Activité et budget"
        description={`Suivi des unités de travail acceptées et des décisions de supervision pour ${data.period.label.toLowerCase()}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <FinanceRateDialog
              defaultEffectiveFrom={data.nextRateDate}
              currentOperatorValue={data.activeRate?.operatorPointValue}
              currentSupervisorValue={data.activeRate?.supervisorPointValue}
              currency={data.summary.currency}
            />
            <Link className={cn(buttonVariants({ variant: "default" }))} href={`/api/finance/export?month=${data.period.key}`}>
              <Download /> Exporter
            </Link>
          </div>
        }
        stats={[
          { label: "Points opérateurs", value: data.summary.operatorPoints },
          { label: "Décisions superviseurs", value: data.summary.supervisorPoints },
          { label: "Points valorisés", value: data.summary.totalPoints - data.summary.uncoveredPoints, tone: "success" },
          { label: "Budget projeté", value: money.format(data.summary.projectedAmount), tone: "warning" },
        ]}
      />

      <section className="flex flex-col gap-3 border-y border-border/70 bg-card/65 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
        <form className="flex flex-wrap items-end gap-2" method="get">
          <div className="space-y-1">
            <label htmlFor="finance-month" className="text-xs font-medium text-muted-foreground">Période analysée</label>
            <Input id="finance-month" name="month" type="month" defaultValue={data.period.key} className="w-44 bg-background" />
          </div>
          <Button type="submit" variant="outline"><CalendarDays /> Actualiser</Button>
        </form>
        {data.activeRate ? (
          <div className="text-sm text-muted-foreground">
            Barème de fin de période: <strong className="text-foreground">{money.format(data.activeRate.operatorPointValue)}</strong> / point opérateur, <strong className="text-foreground">{money.format(data.activeRate.supervisorPointValue)}</strong> / décision.
          </div>
        ) : (
          <Badge variant="outline" className="w-fit rounded-md border-brand-gold/40 text-brand-gold">Aucun barème actif</Badge>
        )}
      </section>

      {data.summary.uncoveredPoints > 0 ? (
        <Alert>
          <Info />
          <AlertTitle>Valorisation incomplète</AlertTitle>
          <AlertDescription>
            {data.summary.uncoveredPoints} point{data.summary.uncoveredPoints > 1 ? "s" : ""} précède{data.summary.uncoveredPoints > 1 ? "nt" : ""} le premier barème disponible. Les volumes restent exacts; le budget les exclut jusqu&apos;à l&apos;initialisation du barème historique.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle>Production acceptée des opérateurs</CardTitle>
            <CardDescription>Le point est acquis uniquement après l&apos;acceptation d&apos;une étape par la supervision.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.operatorRows.length === 0 ? <EmptyState label="Aucun opérateur dans ce périmètre." /> : (
              <>
                <div className="divide-y divide-border/60 md:hidden">
                  {data.operatorRows.map((row) => (
                    <article key={row.id} className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h2 className="truncate font-medium">{row.name}</h2><p className="truncate text-xs text-muted-foreground">{row.matricule}{row.supervisorName ? ` · ${row.supervisorName}` : ""}</p></div>
                        <div className="text-right"><p className="text-xl font-semibold tabular-nums">{row.points}</p><p className="text-xs text-muted-foreground">points</p></div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 border-y border-border/60 py-3">
                        <MobileMetric label="Collecte" value={row.activities.COLLECTE} />
                        <MobileMetric label="Numéris." value={row.activities.NUMERISATION} />
                        <MobileMetric label="Index." value={row.activities.INDEXATION} />
                        <MobileMetric label="Archive" value={row.activities.ARCHIVAGE} />
                      </div>
                      <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">Projection mensuelle</span><strong className="tabular-nums">{money.format(row.projectedAmount)}</strong></div>
                      {row.uncoveredPoints ? <p className="text-xs text-brand-gold">{row.uncoveredPoints} point{row.uncoveredPoints > 1 ? "s" : ""} non valorisé{row.uncoveredPoints > 1 ? "s" : ""}</p> : null}
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[820px]">
                    <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-4">Opérateur</TableHead><TableHead>Collecte</TableHead><TableHead>Numérisation</TableHead><TableHead>Indexation</TableHead><TableHead>Archivage</TableHead><TableHead>Points</TableHead><TableHead className="pr-4 text-right">Projection</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{data.operatorRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.matricule}{row.supervisorName ? ` · ${row.supervisorName}` : ""}</p></TableCell>
                        <TableCell className="tabular-nums">{row.activities.COLLECTE}</TableCell><TableCell className="tabular-nums">{row.activities.NUMERISATION}</TableCell><TableCell className="tabular-nums">{row.activities.INDEXATION}</TableCell><TableCell className="tabular-nums">{row.activities.ARCHIVAGE}</TableCell>
                        <TableCell><strong className="tabular-nums">{row.points}</strong>{row.uncoveredPoints ? <p className="text-xs text-brand-gold">{row.uncoveredPoints} non valorisé{row.uncoveredPoints > 1 ? "s" : ""}</p> : null}</TableCell>
                        <TableCell className="pr-4 text-right font-semibold tabular-nums">{money.format(row.projectedAmount)}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60">
            <CardTitle>Décisions de supervision</CardTitle>
            <CardDescription>Chaque validation ou rejet tracé constitue une décision comptabilisée.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.supervisorRows.length === 0 ? <EmptyState label="Aucun superviseur enregistré." /> : (
              <>
                <div className="divide-y divide-border/60 md:hidden">
                  {data.supervisorRows.map((row) => (
                    <article key={row.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3"><h2 className="font-medium">{row.name}</h2><strong className="tabular-nums">{money.format(row.projectedAmount)}</strong></div>
                      <div className="grid grid-cols-3 gap-3"><MobileMetric label="Validations" value={row.validations} /><MobileMetric label="Rejets" value={row.rejections} /><MobileMetric label="Points" value={row.points} /></div>
                      {row.uncoveredPoints ? <p className="text-xs text-brand-gold">{row.uncoveredPoints} point{row.uncoveredPoints > 1 ? "s" : ""} non valorisé{row.uncoveredPoints > 1 ? "s" : ""}</p> : null}
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[520px]">
                    <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Superviseur</TableHead><TableHead>Validations</TableHead><TableHead>Rejets</TableHead><TableHead>Points</TableHead><TableHead className="pr-4 text-right">Projection</TableHead></TableRow></TableHeader>
                    <TableBody>{data.supervisorRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4 font-medium">{row.name}</TableCell><TableCell className="tabular-nums text-brand-green">{row.validations}</TableCell><TableCell className="tabular-nums text-destructive">{row.rejections}</TableCell><TableCell className="font-semibold tabular-nums">{row.points}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{money.format(row.projectedAmount)}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/95">
        <CardHeader className="border-b border-border/60">
          <div className="flex items-start justify-between gap-3">
            <div><CardTitle>Registre des barèmes</CardTitle><CardDescription>Historique non modifiable des valeurs et de leurs périodes d&apos;application.</CardDescription></div>
            <Badge variant="outline" className="rounded-md">{data.rates.length} version{data.rates.length > 1 ? "s" : ""}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {data.rates.length === 0 ? <EmptyState label="Aucun barème enregistré. Planifiez le premier barème pour valoriser les points." /> : (
            <div className="overflow-x-auto">
              <Table className="min-w-[660px]">
                <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40"><TableHead className="pl-4">Période d&apos;application</TableHead><TableHead>Point opérateur</TableHead><TableHead>Décision superviseur</TableHead><TableHead>Devise</TableHead><TableHead className="pr-4 text-right">Statut</TableHead></TableRow></TableHeader>
                <TableBody>{[...data.rates].reverse().map((rate) => {
                  const rateMoney = currencyFormatter(rate.currency);
                  return <TableRow key={rate.id}><TableCell className="pl-4 font-medium">Du {shortDate(rate.effectiveFrom)}{rate.effectiveTo ? ` au ${shortDateBefore(rate.effectiveTo)}` : " · sans date de fin"}</TableCell><TableCell className="tabular-nums">{rateMoney.format(rate.operatorPointValue)}</TableCell><TableCell className="tabular-nums">{rateMoney.format(rate.supervisorPointValue)}</TableCell><TableCell>{rate.currency}</TableCell><TableCell className="pr-4 text-right"><Badge variant={rate.effectiveTo ? "secondary" : "outline"} className="rounded-md">{rate.effectiveTo ? "Clôturé" : "Actif / planifié"}</Badge></TableCell></TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 border-t border-border/70 pt-5 lg:grid-cols-[1fr_1fr]">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CircleDollarSign className="h-4 w-4" /></span>
          <div><h2 className="font-medium">Règle de reconnaissance</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Les brouillons, soumissions en attente et reprises après rejet ne sont pas payés deux fois. Seule la décision finale inscrite dans le workflow déclenche le point.</p></div>
        </div>
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green"><CalendarDays className="h-4 w-4" /></span>
          <div><h2 className="font-medium">Traçabilité budgétaire</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Chaque point utilise le barème actif au moment de l&apos;événement. Une nouvelle valeur s&apos;applique uniquement à partir de sa date d&apos;effet.</p></div>
        </div>
      </section>
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0"><p className="truncate text-[10px] text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{label}</div>;
}

function shortDateBefore(value: string) {
  return shortDate(new Date(new Date(value).getTime() - 24 * 60 * 60 * 1000).toISOString());
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function currencyFormatter(currency: string) {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: currency === "XOF" ? 0 : 2 });
  } catch {
    const fallback = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
    return { format: (value: number) => `${fallback.format(value)} ${currency}` };
  }
}