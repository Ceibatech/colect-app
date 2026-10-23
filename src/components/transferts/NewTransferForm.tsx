"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronLeft, ChevronRight, FileBox, Loader2, PackageCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { createTransferLot, type TransferActionState } from "@/lib/services/transfer-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface SiteOption {
  id: number;
  code: string;
  nom: string;
  organisation: "MINISTERE" | "CEIBA" | "AUTRE";
  entrepots: Array<{ id: number; code: string; nom: string; localisation: string | null }>;
}

function warehouseLabel(warehouse: SiteOption["entrepots"][number]) {
  return [warehouse.nom, warehouse.localisation].filter(Boolean).join(" · ");
}

interface TransferDossierItem {
  id: number;
  reference: string;
  siteId: number | null;
  codeBarres: string | null;
  libelleCarton: string | null;
  nom: string | null;
  prenoms: string | null;
  statutPreparation: string;
  commune: { nom: string } | null;
  natureDossier: { libelle: string } | null;
  operateur: { matricule: string; nom: string; prenoms: string | null };
}

interface TransferDossierPage {
  items: TransferDossierItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const initialState: TransferActionState = {};
const emptyPage: TransferDossierPage = { items: [], total: 0, page: 1, pageSize: 40, totalPages: 1 };
const MAX_DOSSIERS = 500;

export function NewTransferForm({ sites }: { sites: SiteOption[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTransferLot, initialState);
  const ministrySites = useMemo(() => sites.filter((site) => site.organisation === "MINISTERE"), [sites]);
  const ceibaSites = useMemo(() => sites.filter((site) => site.organisation === "CEIBA"), [sites]);
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [sourceEntrepotId, setSourceEntrepotId] = useState("none");
  const [destinationSiteId, setDestinationSiteId] = useState(() => ceibaSites.length === 1 ? String(ceibaSites[0].id) : "");
  const [destinationEntrepotId, setDestinationEntrepotId] = useState("none");
  const [includeUnlocated, setIncludeUnlocated] = useState(true);
  const [selected, setSelected] = useState<Map<number, TransferDossierItem>>(new Map());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<TransferDossierPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!state.success || !state.lotId) return;
    toast.success(state.message ?? "Lot créé.");
    router.push(`/transferts/${state.lotId}`);
  }, [state, router]);

  useEffect(() => {
    if (!sourceSiteId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      const params = new URLSearchParams({ site: sourceSiteId, entrepot: sourceEntrepotId, page: String(page) });
      if (includeUnlocated) params.set("unlocated", "1");
      if (search.trim()) params.set("q", search.trim());
      try {
        const response = await fetch(`/api/transferts/dossiers?${params}`, { signal: controller.signal });
        const payload = await response.json() as TransferDossierPage | { error?: string };
        if (!response.ok || !("items" in payload)) throw new Error("error" in payload ? payload.error : "Chargement impossible.");
        setResults(payload);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults(emptyPage);
        setLoadError(error instanceof Error ? error.message : "Le stock n'a pas pu être chargé.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [sourceSiteId, sourceEntrepotId, includeUnlocated, search, page]);

  const sourceSite = ministrySites.find((site) => String(site.id) === sourceSiteId);
  const destinationSite = ceibaSites.find((site) => String(site.id) === destinationSiteId);
  const selectedIds = useMemo(() => [...selected.keys()], [selected]);
  const allPageSelected = results.items.length > 0 && results.items.every((item) => selected.has(item.id));

  function resetSourceSelection() {
    setSelected(new Map());
    setSearch("");
    setPage(1);
    setResults(emptyPage);
    setLoadError("");
  }

  function changeSourceSite(value: string | null) {
    setSourceSiteId(value ?? "");
    setSourceEntrepotId("none");
    resetSourceSelection();
  }

  function changeSourceWarehouse(value: string | null) {
    setSourceEntrepotId(value ?? "none");
    resetSourceSelection();
  }

  function changeIncludeUnlocated(checked: boolean) {
    setIncludeUnlocated(checked);
    setPage(1);
    if (!checked) {
      setSelected((current) => new Map([...current].filter(([, item]) => item.siteId !== null)));
    }
  }

  function toggleDossier(item: TransferDossierItem, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) {
        if (next.size >= MAX_DOSSIERS && !next.has(item.id)) {
          toast.error(`Un lot est limité à ${MAX_DOSSIERS} dossiers.`);
          return current;
        }
        next.set(item.id, item);
      } else {
        next.delete(item.id);
      }
      return next;
    });
  }

  function toggleCurrentPage() {
    setSelected((current) => {
      const next = new Map(current);
      if (allPageSelected) {
        results.items.forEach((item) => next.delete(item.id));
      } else {
        for (const item of results.items) {
          if (next.size >= MAX_DOSSIERS) break;
          next.set(item.id, item);
        }
        if (current.size + results.items.filter((item) => !current.has(item.id)).length > MAX_DOSSIERS) {
          toast.warning(`Les ${MAX_DOSSIERS} premiers dossiers ont été sélectionnés.`);
        }
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="dossierIds" value={selectedIds.join(",")} />
      <input type="hidden" name="includeUnlocated" value={String(includeUnlocated)} />
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}

      <section className="grid gap-5 rounded-lg border bg-card p-4 shadow-sm lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:p-5">
        <div className="space-y-4">
          <div><h2 className="font-semibold">Site du ministère · origine</h2><p className="text-sm text-muted-foreground">Site d&apos;inventaire qui détient actuellement les dossiers.</p></div>
          <div className="space-y-2">
            <Label>Site du ministère</Label>
            <Select
              name="sourceSiteId"
              items={ministrySites.map((site) => ({ label: `${site.nom} · ${site.code}`, value: String(site.id) }))}
              value={sourceSiteId}
              onValueChange={changeSourceSite}
              disabled={pending}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir le site du ministère" /></SelectTrigger>
              <SelectContent>{ministrySites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.nom} · {site.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle d&apos;origine</Label>
            <Select
              name="sourceEntrepotId"
              items={[
                { label: "Sans entrepôt précisé", value: "none" },
                ...(sourceSite?.entrepots ?? []).map((warehouse) => ({ label: warehouseLabel(warehouse), value: String(warehouse.id) })),
              ]}
              value={sourceEntrepotId}
              onValueChange={changeSourceWarehouse}
              disabled={pending || !sourceSite}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans entrepôt précisé</SelectItem>
                {sourceSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouseLabel(warehouse)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="hidden h-full items-center text-muted-foreground lg:flex"><ArrowRight className="mt-16 h-6 w-6" /></div>

        <div className="space-y-4">
          <div><h2 className="font-semibold">Site CEIBA · destination</h2><p className="text-sm text-muted-foreground">Site de traitement qui intégrera le stock après réception signée.</p></div>
          <div className="space-y-2">
            <Label>Site CEIBA</Label>
            <Select
              name="destinationSiteId"
              items={ceibaSites.map((site) => ({ label: `${site.nom} · ${site.code}`, value: String(site.id) }))}
              value={destinationSiteId}
              onValueChange={(value) => { setDestinationSiteId(value ?? ""); setDestinationEntrepotId("none"); }}
              disabled={pending}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir le site CEIBA" /></SelectTrigger>
              <SelectContent>{ceibaSites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.nom} · {site.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle de destination</Label>
            <Select
              name="destinationEntrepotId"
              items={[
                { label: "Sans entrepôt précisé", value: "none" },
                ...(destinationSite?.entrepots ?? []).map((warehouse) => ({ label: warehouseLabel(warehouse), value: String(warehouse.id) })),
              ]}
              value={destinationEntrepotId}
              onValueChange={(value) => setDestinationEntrepotId(value ?? "none")}
              disabled={pending || !destinationSite}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sans entrepôt précisé</SelectItem>
                {destinationSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouseLabel(warehouse)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-end lg:justify-between lg:p-5">
          <div><h2 className="font-semibold">Dossiers disponibles au site du ministère</h2><p className="text-sm text-muted-foreground">Sélectionnez les dossiers inventoriés à remettre au gestionnaire de transfert CEIBA.</p></div>
          <div className="relative w-full lg:w-96"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Référence, titulaire, carton..." className="pl-9" disabled={!sourceSiteId} /></div>
        </div>

        <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="rounded-md">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</Badge>
              <span className="text-muted-foreground">{sourceSiteId ? `${results.total} dossier${results.total > 1 ? "s" : ""} disponible${results.total > 1 ? "s" : ""}` : "Choisissez le site du ministère pour charger l'inventaire"}</span>
            </div>
            {results.items.length > 0 ? <Button type="button" size="sm" variant="outline" onClick={toggleCurrentPage}>{allPageSelected ? "Retirer cette page" : "Sélectionner cette page"}</Button> : null}
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border/70 bg-background/70 p-3 text-sm">
            <Checkbox checked={includeUnlocated} onCheckedChange={(value) => changeIncludeUnlocated(value === true)} disabled={pending} />
            <span><span className="block font-medium">Inclure le stock historique sans emplacement</span><span className="mt-0.5 block text-xs text-muted-foreground">Les dossiers importés sans site seront rattachés au site A uniquement s&apos;ils sont sélectionnés dans ce lot.</span></span>
          </label>
        </div>

        {loadError ? <Alert variant="destructive" className="m-4 lg:m-5"><AlertDescription>{loadError}</AlertDescription></Alert> : null}
        {!sourceSiteId ? (
          <div className="px-5 py-14 text-center"><FileBox className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">Point de départ requis</p><p className="mt-1 text-sm text-muted-foreground">Le stock affiché dépend du site et de l&apos;entrepôt d&apos;origine.</p></div>
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" /> Chargement du stock...</div>
        ) : results.items.length === 0 && !loadError ? (
          <div className="px-5 py-14 text-center"><FileBox className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">Aucun dossier disponible</p><p className="mt-1 text-sm text-muted-foreground">Modifiez la recherche ou vérifiez l&apos;emplacement sélectionné.</p></div>
        ) : (
          <>
            <div className="divide-y lg:hidden">
              {results.items.map((item) => <DossierMobileRow key={item.id} item={item} checked={selected.has(item.id)} disabled={pending} onToggle={toggleDossier} />)}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <Table className="min-w-[980px]">
                <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="w-12 pl-5" /><TableHead>Dossier</TableHead><TableHead>Titulaire</TableHead><TableHead>Contenant physique</TableHead><TableHead>Classement</TableHead><TableHead className="pr-5">Opérateur</TableHead></TableRow></TableHeader>
                <TableBody>
                  {results.items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-accent/25">
                      <TableCell className="pl-5"><Checkbox checked={selected.has(item.id)} onCheckedChange={(value) => toggleDossier(item, value === true)} disabled={pending} aria-label={`Sélectionner ${item.reference}`} /></TableCell>
                      <TableCell><p className="font-mono font-semibold">{item.reference}</p><p className="mt-1 text-xs text-muted-foreground">{item.siteId === null ? "Emplacement à confirmer" : `Préparation ${formatStatus(item.statutPreparation)}`}</p></TableCell>
                      <TableCell><p className="font-medium">{personLabel(item)}</p><p className="mt-1 text-xs text-muted-foreground">{item.commune?.nom ?? "Commune non renseignée"}</p></TableCell>
                      <TableCell><p className="font-mono text-sm">{item.codeBarres ?? "Sans code-barres"}</p><p className="mt-1 max-w-60 truncate text-xs text-muted-foreground">{item.libelleCarton ?? "Sans libellé de carton"}</p></TableCell>
                      <TableCell>{item.natureDossier?.libelle ?? <span className="text-muted-foreground">Non renseignée</span>}</TableCell>
                      <TableCell className="pr-5"><p>{item.operateur.prenoms} {item.operateur.nom}</p><p className="mt-1 text-xs text-muted-foreground">{item.operateur.matricule}</p></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {sourceSiteId && !loadError ? (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5">
            <p className="text-sm text-muted-foreground">Page <strong className="text-foreground">{results.page}</strong> sur <strong className="text-foreground">{results.totalPages}</strong></p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || results.page <= 1}><ChevronLeft /> Précédent</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.min(results.totalPages, value + 1))} disabled={loading || results.page >= results.totalPages}>Suivant <ChevronRight /></Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-2 lg:p-5">
        <div className="space-y-2"><Label htmlFor="plannedAt">Date de transfert prévue</Label><Input id="plannedAt" name="plannedAt" type="datetime-local" disabled={pending} /></div>
        <div className="space-y-2 sm:row-span-2"><Label htmlFor="motif">Objet / contexte</Label><Textarea id="motif" name="motif" rows={4} maxLength={2000} placeholder="Ex. prise en charge pour numérisation et indexation" disabled={pending} /></div>
        <p className="text-xs leading-5 text-muted-foreground">Après création, soumettez le lot au responsable CEIBA. Sa validation transmet le lot au ministère pour autorisation. Le stock du site d&apos;inventaire ne diminue qu&apos;après le F02 signé ; le stock du site CEIBA augmente après la réception validée.</p>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || selected.size === 0 || !sourceSiteId || !destinationSiteId}>
          {pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}
          Constituer le lot · {selected.size} dossier{selected.size > 1 ? "s" : ""}
        </Button>
      </div>
    </form>
  );
}

function DossierMobileRow({ item, checked, disabled, onToggle }: { item: TransferDossierItem; checked: boolean; disabled: boolean; onToggle: (item: TransferDossierItem, checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/35">
      <Checkbox checked={checked} onCheckedChange={(value) => onToggle(item, value === true)} disabled={disabled} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono">{item.reference}</strong><span className="text-xs text-muted-foreground">{item.codeBarres ?? "Sans code-barres"}</span></span>
        <span className="mt-1 block font-medium">{personLabel(item)}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{item.siteId === null ? "Emplacement à confirmer" : item.commune?.nom ?? "Commune non renseignée"} · {item.natureDossier?.libelle ?? "Nature non renseignée"}</span>
      </span>
    </label>
  );
}

function personLabel(item: Pick<TransferDossierItem, "nom" | "prenoms">) {
  return [item.nom, item.prenoms].filter(Boolean).join(" ") || "Titulaire non renseigné";
}

function formatStatus(value: string) {
  return value.toLocaleLowerCase("fr").replaceAll("_", " ");
}
