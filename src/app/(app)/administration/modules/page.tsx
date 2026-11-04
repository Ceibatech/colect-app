import { Power } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { PageHeader } from "@/components/layout/PageHeader";
import { ModuleSwitches } from "@/components/administration/ModuleSwitches";
import { APP_MODULES } from "@/lib/modules/catalog";
import { forgetDisabledModulesCache, getDisabledModules } from "@/lib/modules/state";

export const metadata = { title: "Modules - GeoArchives" };

export default async function AdminModulesPage() {
  await requirePermission("SETTINGS_MANAGE");
  // Toujours l'état réel sur cette page, sans le délai du cache.
  forgetDisabledModulesCache();
  const disabled = await getDisabledModules();
  const rows = APP_MODULES.map((mod) => ({ code: mod.code, label: mod.label, description: mod.description, outage: disabled[mod.code] ?? null }));
  const offCount = rows.filter((row) => row.outage).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        icon={Power}
        title="Modules"
        description="Mettez un module hors service s'il pose problème : il disparaît du menu, ses pages affichent un avis et ses actions sont bloquées, pendant que le reste de l'application continue de tourner. Aucun redéploiement, aucune donnée supprimée."
        stats={[
          { label: "En service", value: rows.length - offCount },
          { label: "Hors service", value: offCount, tone: offCount ? "warning" : "default" },
        ]}
      />
      <ModuleSwitches modules={rows} />
      <p className="text-xs text-muted-foreground">L&apos;administration, le tableau de bord et la connexion restent toujours disponibles. Chaque changement est inscrit au journal d&apos;audit.</p>
    </div>
  );
}
