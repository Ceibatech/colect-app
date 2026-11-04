"use client";

import { useActionState, useEffect } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setModuleAvailability, type ModuleActionState } from "@/lib/services/module-service";
import type { ModuleOutage } from "@/lib/modules/catalog";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

export interface ModuleRow {
  code: string;
  label: string;
  description: string;
  outage: ModuleOutage | null;
}

/** Une ligne par module : mise hors service (avec motif) ou remise en service. */
export function ModuleSwitches({ modules }: { modules: ModuleRow[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {modules.map((mod) => <ModuleSwitch key={mod.code} module={mod} />)}
    </ul>
  );
}

function ModuleSwitch({ module: mod }: { module: ModuleRow }) {
  const [state, formAction, pending] = useActionState<ModuleActionState, FormData>(setModuleAvailability, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state]);
  const off = mod.outage !== null;

  return (
    <li className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{mod.label}</span>
          {off
            ? <Badge variant="outline" className="rounded-md border-destructive/40 text-destructive">Hors service</Badge>
            : <Badge variant="outline" className="rounded-md border-brand-green/40 text-brand-green">En service</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{mod.description}</p>
        {mod.outage ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Depuis le {date.format(new Date(mod.outage.at))}{mod.outage.by ? `, par ${mod.outage.by}` : ""}{mod.outage.motif ? ` : ${mod.outage.motif}` : ""}
          </p>
        ) : null}
      </div>
      <form action={formAction} className="flex w-full shrink-0 gap-2 lg:w-auto">
        <input type="hidden" name="module" value={mod.code} />
        <input type="hidden" name="enable" value={off ? "1" : "0"} />
        {off ? null : <Input name="motif" placeholder="Motif (affiché aux utilisateurs)" maxLength={300} className="lg:w-72" disabled={pending} />}
        <Button type="submit" variant={off ? "default" : "outline"} disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="animate-spin" /> : off ? <Power /> : <PowerOff />}
          {off ? "Remettre en service" : "Mettre hors service"}
        </Button>
      </form>
    </li>
  );
}
