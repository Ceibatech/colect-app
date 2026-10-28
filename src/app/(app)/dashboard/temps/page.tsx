import Link from "next/link";
import { Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission, requireRole } from "@/lib/auth/current-user";
import { formatDuree, INACTIVITE_MINUTES, jourDe } from "@/lib/activite/categories";
import { getTempsDeTravail } from "@/lib/services/temps-travail-service";

export const metadata = { title: "Temps de travail — GeoArchives" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" });

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Temps de travail de chaque personne, par activité : temps actif à l'écran
 * (au-delà de 10 minutes sans action, le temps ne compte plus) et dossiers
 * traités, avec le temps moyen par dossier. Réservé au superviseur et à l'administrateur.
 */
export default async function TempsDeTravailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole("ADMIN", "SUPERVISEUR");
  await requirePermission("DASHBOARD_VIEW");
  const params = await searchParams;
  const today = jourDe(new Date());
  let du = single(params.du) ?? today;
  let au = single(params.au) ?? du;
  if (!DAY.test(du)) du = today;
  if (!DAY.test(au) || au < du) au = du;
  // 31 jours au plus.
  const maxAu = jourDe(new Date(new Date(`${du}T00:00:00Z`).getTime() + 30 * 86_400_000));
  if (au > maxAu) au = maxAu;
  const data = await getTempsDeTravail(du, au);
  const shift = (days: number) => jourDe(new Date(new Date(`${du}T00:00:00Z`).getTime() + days * 86_400_000));
  const periode = du === au ? longDate.format(new Date(`${du}T00:00:00Z`)) : `du ${du.split("-").reverse().join("/")} au ${au.split("-").reverse().join("/")}`;

  return (
    <div className="space-y-5">
      <PageHeader
        tone="dashboard"
        icon={Timer}
        eyebrow="Tableau de bord"
        title="Temps de travail"
        description={`Temps actif de chaque personne par activité, ${periode}. Le temps compte tant que la personne agit à l'écran ; au-delà de ${INACTIVITE_MINUTES} minutes sans action, il s'arrête.`}
        stats={[
          { label: "Personnes actives", value: data.rows.length },
          { label: "Temps total", value: formatDuree(data.totalMinutes) },
          { label: "Dossiers traités", value: data.totalDossiers },
        ]}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Du</span>
          <input type="date" name="du" defaultValue={du} max={today} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Au</span>
          <input type="date" name="au" defaultValue={au} max={today} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </label>
        <Button type="submit" variant="outline">Afficher</Button>
        <div className="ml-auto flex gap-2">
          <Link href={`/dashboard/temps?du=${shift(-1)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Jour précédent</Link>
          <Link href="/dashboard/temps" className={buttonVariants({ variant: "ghost", size: "sm" })}>Aujourd&apos;hui</Link>
        </div>
      </form>

      <section className="overflow-hidden rounded-lg border bg-card">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Aucune activité enregistrée sur cette période. Le temps est mesuré depuis la mise en service de ce tableau de bord.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Personne</TableHead>
                  <TableHead>Temps total</TableHead>
                  {data.activites.map((activite) => <TableHead key={activite.code}>{activite.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="pl-5">
                      <span className="block font-medium">{row.nom}</span>
                      <span className="block text-xs text-muted-foreground">{row.role}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block font-semibold tabular-nums">{formatDuree(row.minutes)}</span>
                      {row.dossiers ? <span className="block text-xs text-muted-foreground">{row.dossiers} dossier{row.dossiers > 1 ? "s" : ""}</span> : null}
                    </TableCell>
                    {data.activites.map((activite) => {
                      const cell = row.parActivite[activite.code];
                      if (!cell) return <TableCell key={activite.code} className="text-muted-foreground">—</TableCell>;
                      const unites = cell.dossiers || cell.actions;
                      return (
                        <TableCell key={activite.code} className="tabular-nums">
                          <span className="block">{cell.minutes ? formatDuree(cell.minutes) : "—"}</span>
                          {unites ? (
                            <span className="block text-xs text-muted-foreground">
                              {unites} {cell.dossiers ? `dossier${unites > 1 ? "s" : ""}` : `action${unites > 1 ? "s" : ""}`}
                              {cell.minutes ? ` · ${Math.max(1, Math.round(cell.minutes / unites))} min en moyenne` : ""}
                            </span>
                          ) : null}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
