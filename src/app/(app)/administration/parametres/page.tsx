import { prisma } from "@/lib/prisma/client";
import { requirePermission } from "@/lib/auth/current-user";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

export const metadata = { title: "Configuration applicative - GeoArchives-MULCV" };

interface SettingView {
  id: number;
  key: string;
  value: string | null;
  description: string | null;
  isPublic: boolean;
  updatedAt: Date;
}

const SETTING_LABELS: Record<string, string> = {
  APP_NAME: "Nom de l'application",
};

export default async function AdminParametresPage() {
  await requirePermission("SETTINGS_MANAGE");

  const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  const configuredSettings = settings.filter((setting) => Boolean(setting.value?.trim())).length;
  const publicSettings = settings.filter((setting) => setting.isPublic).length;
  const privateSettings = settings.length - publicSettings;
  const completionRate = settings.length > 0 ? Math.round((configuredSettings / settings.length) * 100) : 0;
  const lastUpdated = settings.reduce<Date | null>((latest, setting) => {
    if (!latest || setting.updatedAt > latest) return setting.updatedAt;
    return latest;
  }, null);

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Administration système"
        icon={SlidersHorizontal}
        title="Configuration applicative"
        description="Consultez les paramètres qui gouvernent l'application et contrôlez leur niveau d'exposition."
        actions={
          <Badge variant={completionRate === 100 ? "outline" : "secondary"} className={completionRate === 100 ? "rounded-md border-brand-green/25 bg-brand-green/8 text-brand-green" : "rounded-md"}>
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            {completionRate === 100 ? "Configuration complète" : `${configuredSettings}/${settings.length} configurés`}
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="min-w-0 bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Database className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0">
                  <CardTitle>Registre de configuration</CardTitle>
                  <CardDescription>Référentiel des valeurs actives et de leur visibilité.</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="w-fit rounded-md bg-background/70">
                {settings.length} {settings.length === 1 ? "paramètre" : "paramètres"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {settings.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center px-5 py-12 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                  <KeyRound className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-base font-semibold">Aucun paramètre enregistré</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Le registre est actuellement vide.</p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto lg:block">
                  <Table className="min-w-[920px]">
                    <TableHeader>
                      <TableRow className="bg-muted/45 hover:bg-muted/45">
                        <TableHead className="min-w-56 pl-5">Paramètre</TableHead>
                        <TableHead className="min-w-64">Valeur active</TableHead>
                        <TableHead className="min-w-64">Description</TableHead>
                        <TableHead>Visibilité</TableHead>
                        <TableHead>État</TableHead>
                        <TableHead className="pr-5 text-right">Mise à jour</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settings.map((setting) => <SettingTableRow key={setting.id} setting={setting} />)}
                    </TableBody>
                  </Table>
                </div>
                <div className="divide-y divide-border/60 lg:hidden">
                  {settings.map((setting) => <SettingMobileRow key={setting.id} setting={setting} />)}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-green/10 text-brand-green ring-1 ring-brand-green/20">
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <div>
                <CardTitle>Gouvernance</CardTitle>
                <CardDescription>État et exposition du registre.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-1">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Configuration renseignée</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-brand-green">{completionRate}%</p>
                </div>
                <span className="text-xs text-muted-foreground">{configuredSettings}/{settings.length}</span>
              </div>
              <Progress value={completionRate} className="mt-3 [&_[data-slot=progress-indicator]]:bg-brand-green" />
            </div>

            <div className="space-y-3 border-y border-border/60 py-4">
              <ExposureRow icon={Eye} label="Visible dans l'interface" value={publicSettings} tone="primary" />
              <ExposureRow icon={LockKeyhole} label="Réservé au serveur" value={privateSettings} tone="success" />
            </div>

            <div className="rounded-lg bg-muted/45 p-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4 text-brand-green" />Valeurs protégées</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Les valeurs réservées au serveur sont masquées dans le registre.</p>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Dernière mise à jour</span>
              <span className="font-medium text-foreground">{lastUpdated ? lastUpdated.toLocaleDateString("fr-FR") : "Aucune"}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingTableRow({ setting }: { setting: SettingView }) {
  const configured = Boolean(setting.value?.trim());

  return (
    <TableRow className="hover:bg-accent/25">
      <TableCell className="pl-5">
        <p className="font-semibold">{settingLabel(setting.key)}</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{setting.key}</p>
      </TableCell>
      <TableCell className="max-w-80 whitespace-normal break-words text-sm">{formatSettingValue(setting.value, setting.isPublic)}</TableCell>
      <TableCell className="max-w-80 whitespace-normal break-words text-sm leading-5 text-muted-foreground">{setting.description ?? "Description non renseignée"}</TableCell>
      <TableCell><ExposureBadge isPublic={setting.isPublic} /></TableCell>
      <TableCell><StatusBadge configured={configured} /></TableCell>
      <TableCell className="pr-5 text-right text-muted-foreground">{setting.updatedAt.toLocaleDateString("fr-FR")}</TableCell>
    </TableRow>
  );
}

function SettingMobileRow({ setting }: { setting: SettingView }) {
  const configured = Boolean(setting.value?.trim());

  return (
    <article className="space-y-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{settingLabel(setting.key)}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{setting.key}</p>
        </div>
        <StatusBadge configured={configured} />
      </div>
      <div>
        <p className="text-xs font-medium uppercase text-muted-foreground">Valeur active</p>
        <p className="mt-1 break-words text-sm">{formatSettingValue(setting.value, setting.isPublic)}</p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{setting.description ?? "Description non renseignée"}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3">
        <ExposureBadge isPublic={setting.isPublic} />
        <span className="text-xs text-muted-foreground">Mis à jour le {setting.updatedAt.toLocaleDateString("fr-FR")}</span>
      </div>
    </article>
  );
}

function ExposureBadge({ isPublic }: { isPublic: boolean }) {
  return (
    <Badge variant="outline" className={isPublic ? "rounded-md border-primary/20 bg-primary/5 text-primary" : "rounded-md border-brand-green/20 bg-brand-green/5 text-brand-green"}>
      {isPublic ? <Eye className="mr-1 h-3 w-3" /> : <LockKeyhole className="mr-1 h-3 w-3" />}
      {isPublic ? "Interface" : "Serveur"}
    </Badge>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <Badge variant={configured ? "outline" : "secondary"} className={configured ? "rounded-md border-brand-green/20 bg-brand-green/5 text-brand-green" : "rounded-md"}>
      {configured ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
      {configured ? "Configuré" : "À compléter"}
    </Badge>
  );
}

function ExposureRow({ icon: Icon, label, value, tone }: { icon: typeof Eye; label: string; value: number; tone: "primary" | "success" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Icon className={tone === "primary" ? "h-4 w-4 shrink-0 text-primary" : "h-4 w-4 shrink-0 text-brand-green"} />
        <span className="truncate">{label}</span>
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function settingLabel(key: string) {
  if (SETTING_LABELS[key]) return SETTING_LABELS[key];
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSettingValue(value: string | null, isPublic: boolean) {
  const trimmed = value?.trim();
  if (!trimmed) return "Non renseignée";
  if (!isPublic) return "Valeur protégée";
  if (trimmed.length > 120) return `${trimmed.slice(0, 117)}...`;
  return trimmed;
}