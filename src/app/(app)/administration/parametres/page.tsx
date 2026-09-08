import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CheckCircle2, Database, Eye, KeyRound, LockKeyhole, ShieldCheck, SlidersHorizontal, type LucideIcon } from "lucide-react";

export const metadata = { title: "Parametres - Administration" };

type ControlTone = "default" | "success" | "warning";

const controlTones: Record<ControlTone, { icon: string; value: string; surface: string }> = {
  default: {
    icon: "bg-primary/10 text-primary ring-primary/20",
    value: "text-primary",
    surface: "border-primary/20 bg-primary/[0.035]",
  },
  success: {
    icon: "bg-brand-green/10 text-brand-green ring-brand-green/20",
    value: "text-brand-green",
    surface: "border-brand-green/25 bg-brand-green/[0.04]",
  },
  warning: {
    icon: "bg-brand-gold/15 text-brand-gold ring-brand-gold/25",
    value: "text-brand-gold",
    surface: "border-brand-gold/30 bg-brand-gold/[0.045]",
  },
};

export default async function AdminParametresPage() {
  await requirePermission("SETTINGS_MANAGE");

  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  const configuredSettings = settings.filter((setting) => Boolean(setting.value?.trim())).length;
  const publicSettings = settings.filter((setting) => setting.isPublic).length;
  const privateSettings = settings.length - publicSettings;
  const lastUpdated = settings.reduce<Date | null>((latest, setting) => {
    if (!latest || setting.updatedAt > latest) return setting.updatedAt;
    return latest;
  }, null);

  const controls: Array<{ label: string; value: number | string; description: string; icon: LucideIcon; tone: ControlTone }> = [
    {
      label: "Cl\u00e9s actives",
      value: settings.length,
      description: "Param\u00e8tres enregistr\u00e9s dans la base.",
      icon: Database,
      tone: "default",
    },
    {
      label: "Configur\u00e9s",
      value: configuredSettings,
      description: "Valeurs pr\u00eates pour l'application.",
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "Publics",
      value: publicSettings,
      description: "Autoris\u00e9s c\u00f4t\u00e9 interface.",
      icon: Eye,
      tone: "default",
    },
    {
      label: "Priv\u00e9s",
      value: privateSettings,
      description: "R\u00e9serv\u00e9s au serveur et \u00e0 l'administration.",
      icon: LockKeyhole,
      tone: privateSettings > 0 ? "warning" : "success",
    },
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Configuration"
        icon={SlidersHorizontal}
        title="Param\u00e8tres"
        description="Centre de contr\u00f4le des r\u00e9glages applicatifs, des cl\u00e9s publiques et des param\u00e8tres r\u00e9serv\u00e9s au serveur."
        stats={[
          { label: "Cl\u00e9s", value: settings.length },
          { label: "Configur\u00e9s", value: configuredSettings, tone: "success" },
          { label: "Priv\u00e9s", value: privateSettings, tone: privateSettings > 0 ? "warning" : "success" },
          { label: "Derni\u00e8re mise \u00e0 jour", value: lastUpdated ? lastUpdated.toLocaleDateString("fr-FR") : "\u2014" },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {controls.map((control) => {
          const Icon = control.icon;
          const style = controlTones[control.tone];

          return (
            <Card key={control.label} className={cn("bg-card/95", style.surface)}>
              <CardContent className="flex min-h-[126px] items-start justify-between gap-3 p-4">
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{control.label}</p>
                  <p className={cn("text-3xl font-semibold tracking-tight tabular-nums", style.value)}>{control.value}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{control.description}</p>
                </div>
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1", style.icon)}>
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>Registre des param&egrave;tres</CardTitle>
                <CardDescription>Inventaire centralis&eacute; des cl&eacute;s, valeurs et niveaux d&apos;exposition.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70">
                {settings.length} {settings.length > 1 ? "entr\u00e9es" : "entr\u00e9e"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {settings.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <KeyRound className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-base font-medium text-foreground">Aucun param&egrave;tre enregistr&eacute;</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Le registre est pr&ecirc;t &agrave; recevoir les r&eacute;glages applicatifs d&egrave;s que la table settings sera aliment&eacute;e.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[14rem] px-4 py-3">Cl&eacute;</TableHead>
                    <TableHead className="min-w-[16rem] px-4 py-3">Valeur</TableHead>
                    <TableHead className="min-w-[18rem] px-4 py-3">Description</TableHead>
                    <TableHead className="px-4 py-3">Exposition</TableHead>
                    <TableHead className="px-4 py-3 text-right">Mise &agrave; jour</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settings.map((setting) => (
                    <TableRow key={setting.id}>
                      <TableCell className="px-4 py-3 font-medium text-foreground">{setting.key}</TableCell>
                      <TableCell className="max-w-[28rem] whitespace-normal break-words px-4 py-3 font-mono text-xs text-muted-foreground">
                        {formatSettingValue(setting.value)}
                      </TableCell>
                      <TableCell className="max-w-[32rem] whitespace-normal break-words px-4 py-3 text-muted-foreground">
                        {setting.description ?? "\u2014"}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={setting.isPublic ? "outline" : "secondary"} className="rounded-md bg-background/70">
                          {setting.isPublic ? "Public" : "Priv\u00e9"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-muted-foreground">{setting.updatedAt.toLocaleDateString("fr-FR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card/95">
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <CardTitle>S&eacute;curit&eacute;</CardTitle>
                  <CardDescription>Les param&egrave;tres priv&eacute;s restent confin&eacute;s aux rendus serveur.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="bg-card/95">
            <CardHeader>
              <CardTitle>Optimisation</CardTitle>
              <CardDescription>Le registre est lu en une seule requ&ecirc;te, tri&eacute; c&ocirc;t&eacute; base et pr&ecirc;t pour les futures actions d&apos;&eacute;dition.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatSettingValue(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "Non d\u00e9fini";

  if (trimmed.length > 96) return `${trimmed.slice(0, 93)}...`;
  return trimmed;
}
