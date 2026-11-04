import Link from "next/link";
import { PowerOff } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { APP_MODULES } from "@/lib/modules/catalog";
import { getDisabledModules } from "@/lib/modules/state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Module indisponible - GeoArchives" };

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

export default async function ModuleIndisponiblePage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const session = await requireUser();
  const { module: code } = await searchParams;
  const mod = APP_MODULES.find((item) => item.code === code);
  const outage = mod ? (await getDisabledModules())[mod.code] : undefined;
  const canManage = session.permissions.includes("SETTINGS_MANAGE");

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <PowerOff className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold">{mod ? `${mod.label} : module momentanément indisponible` : "Module momentanément indisponible"}</h1>
          <p className="text-sm text-muted-foreground">
            L&apos;administrateur a mis ce module hors service le temps d&apos;une correction. Les autres modules fonctionnent normalement et aucune donnée n&apos;est perdue.
          </p>
          {outage ? (
            <p className="text-sm">
              Depuis le {date.format(new Date(outage.at))}{outage.by ? `, par ${outage.by}` : ""}.
              {outage.motif ? <span className="mt-1 block text-muted-foreground">Motif : {outage.motif}</span> : null}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Link href="/dashboard" className={buttonVariants()}>Retour au tableau de bord</Link>
            {canManage ? <Link href="/administration/modules" className={buttonVariants({ variant: "outline" })}>Gérer les modules</Link> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
