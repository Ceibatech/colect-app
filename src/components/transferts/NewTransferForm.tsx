"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, PackageCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { createTransferLot, type TransferActionState } from "@/lib/services/transfer-actions";
import type { TransferCartonOption } from "@/lib/services/transfer-service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface SiteOption {
  id: number;
  code: string;
  nom: string;
  entrepots: Array<{ id: number; code: string; nom: string }>;
}

const initialState: TransferActionState = {};

export function NewTransferForm({ sites, cartons }: { sites: SiteOption[]; cartons: TransferCartonOption[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTransferLot, initialState);
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [sourceEntrepotId, setSourceEntrepotId] = useState("none");
  const [destinationSiteId, setDestinationSiteId] = useState("");
  const [destinationEntrepotId, setDestinationEntrepotId] = useState("none");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!state.success || !state.lotId) return;
    toast.success(state.message ?? "Lot créé.");
    router.push(`/transferts/${state.lotId}`);
  }, [state, router]);

  const sourceSite = sites.find((site) => String(site.id) === sourceSiteId);
  const destinationSite = sites.find((site) => String(site.id) === destinationSiteId);
  const availableCartons = useMemo(() => cartons.filter((carton) => {
    const warehouseMatches = sourceEntrepotId === "none" ? carton.entrepotId === null : carton.entrepotId === Number(sourceEntrepotId);
    const query = search.trim().toLocaleLowerCase("fr");
    return carton.siteId === Number(sourceSiteId)
      && warehouseMatches
      && (!query || `${carton.code} ${carton.label ?? ""} ${carton.dossierReferences.join(" ")}`.toLocaleLowerCase("fr").includes(query));
  }), [cartons, sourceSiteId, sourceEntrepotId, search]);

  function changeSourceSite(value: string | null) {
    setSourceSiteId(value ?? "");
    setSourceEntrepotId("none");
    setSelected([]);
  }

  function changeSourceWarehouse(value: string | null) {
    setSourceEntrepotId(value ?? "none");
    setSelected([]);
  }

  function toggleCarton(key: string, checked: boolean) {
    setSelected((current) => checked
      ? current.includes(key) ? current : [...current, key]
      : current.filter((value) => value !== key));
  }

  const selectedDossiers = cartons.filter((carton) => selected.includes(carton.key)).reduce((sum, carton) => sum + carton.dossierCount, 0);
  return (
    <form action={formAction} className="space-y-6">
      {selected.map((key) => <input key={key} type="hidden" name="cartonKeys" value={key} />)}
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}

      <section className="grid gap-5 rounded-lg border bg-card p-4 shadow-sm lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:p-5">
        <div className="space-y-4">
          <div><h2 className="font-semibold">Point de départ</h2><p className="text-sm text-muted-foreground">Site détenteur du stock avant la remise.</p></div>
          <div className="space-y-2">
            <Label>Site Ministère</Label>
            <Select name="sourceSiteId" value={sourceSiteId} onValueChange={changeSourceSite} disabled={pending}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir le site d'origine" /></SelectTrigger>
              <SelectContent>{sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.nom} · {site.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle</Label>
            <Select name="sourceEntrepotId" value={sourceEntrepotId} onValueChange={changeSourceWarehouse} disabled={pending || !sourceSite}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans entrepôt précisé</SelectItem>
                {sourceSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.nom} · {warehouse.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="hidden h-full items-center text-muted-foreground lg:flex"><ArrowRight className="mt-16 h-6 w-6" /></div>

        <div className="space-y-4">
          <div><h2 className="font-semibold">Destination CEIBAC</h2><p className="text-sm text-muted-foreground">Site de traitement où la garde sera remise.</p></div>
          <div className="space-y-2">
            <Label>Site CEIBAC</Label>
            <Select name="destinationSiteId" value={destinationSiteId} onValueChange={(value) => { setDestinationSiteId(value ?? ""); setDestinationEntrepotId("none"); }} disabled={pending}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir le site CEIBAC" /></SelectTrigger>
              <SelectContent>{sites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.nom} · {site.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle</Label>
            <Select name="destinationEntrepotId" value={destinationEntrepotId} onValueChange={(value) => setDestinationEntrepotId(value ?? "none")} disabled={pending || !destinationSite}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans entrepôt précisé</SelectItem>
                {destinationSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouse.nom} · {warehouse.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between lg:p-5">
          <div><h2 className="font-semibold">Cartons prêts au transfert</h2><p className="text-sm text-muted-foreground">Seuls les cartons dont tous les dossiers ont terminé la Préparation sont proposés.</p></div>
          <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Code-barres, libellé, dossier..." className="pl-9" /></div>
        </div>
        <div className="max-h-[420px] divide-y overflow-y-auto">
          {!sourceSiteId ? <p className="p-8 text-center text-sm text-muted-foreground">Choisissez d&apos;abord un point de départ.</p> : availableCartons.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Aucun carton prêt et disponible pour ce point de départ.</p> : availableCartons.map((carton) => (
            <label key={carton.key} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/40">
              <Checkbox checked={selected.includes(carton.key)} onCheckedChange={(value) => toggleCarton(carton.key, value === true)} disabled={pending} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center justify-between gap-2"><strong>{carton.code}</strong><span className="text-xs tabular-nums text-muted-foreground">{carton.dossierCount} dossier{carton.dossierCount > 1 ? "s" : ""}</span></span>
                <span className="mt-1 block text-sm text-muted-foreground">{carton.label ?? "Carton sans libellé"}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{carton.dossierReferences.join(" · ")}{carton.dossierCount > carton.dossierReferences.length ? " · …" : ""}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 lg:px-5">
          <span className="text-sm"><strong>{selected.length}</strong> carton{selected.length > 1 ? "s" : ""} · <strong>{selectedDossiers}</strong> dossier{selectedDossiers > 1 ? "s" : ""}</span>
          {availableCartons.length > 0 ? <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(availableCartons.every((carton) => selected.includes(carton.key)) ? selected.filter((key) => !availableCartons.some((carton) => carton.key === key)) : [...new Set([...selected, ...availableCartons.map((carton) => carton.key)])])}>{availableCartons.every((carton) => selected.includes(carton.key)) ? "Retirer la liste" : "Sélectionner la liste"}</Button> : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-2 lg:p-5">
        <div className="space-y-2"><Label htmlFor="plannedAt">Date de transfert prévue</Label><Input id="plannedAt" name="plannedAt" type="datetime-local" disabled={pending} /></div>
        <div className="space-y-2 sm:row-span-2"><Label htmlFor="motif">Objet / contexte</Label><Textarea id="motif" name="motif" rows={4} maxLength={2000} placeholder="Ex. prise en charge pour numérisation et indexation" disabled={pending} /></div>
        <p className="text-xs leading-5 text-muted-foreground">Le lot restera en brouillon jusqu&apos;à l&apos;autorisation d&apos;un superviseur. Aucun carton ne sera considéré sorti avant le premier bordereau signé.</p>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || selected.length === 0 || !sourceSiteId || !destinationSiteId}>
          {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          Créer le lot de transfert
        </Button>
      </div>
    </form>
  );
}
