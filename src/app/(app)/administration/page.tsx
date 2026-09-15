import Link from "next/link";
import { Settings } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { NAV_ITEMS } from "@/config/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Administration — GeoArchives-MULCV" };

export default async function AdministrationPage() {
  const session = await requirePermission("USER_MANAGE");
  const modules = NAV_ITEMS.find((item) => item.href === "/administration")?.children?.filter((item) => session.permissions.includes(item.permission)) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        icon={Settings}
        title="Centre de pilotage"
        description="Gérez les accès, les référentiels, les sites, les entrepôts et les paramètres qui structurent toute la chaîne d'archivage."
        stats={[
          { label: "Modules", value: modules.length },
          { label: "Sécurité", value: "Rôles" },
          { label: "Traçabilité", value: "Audit" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.href} href={module.href} className="group block focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
              <Card className="h-full transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_42px_rgba(16,24,40,0.10)]">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <CardTitle>{module.title}</CardTitle>
                      <CardDescription>Ouvrir le module {module.title.toLowerCase()}.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-xs font-medium text-primary">Accéder</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
