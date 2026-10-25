"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, ChevronLeft, ChevronRight, ExternalLink, ListChecks, Loader2, LocateFixed, PackageCheck, Route, Search } from "lucide-react";
import { toast } from "sonner";
import { createTransferLot, type TransferActionState } from "@/lib/services/transfer-actions";
import { suggestTransferRoute } from "@/lib/services/transfer-route-service";
import { buildGoogleMapsDirectionsUrl, formatRouteText, isValidGeoPoint, type GeoPoint } from "@/lib/transfers/route-suggestion";
import { MAX_TRANSFER_CARTONS, type TransferCartonItem } from "@/lib/transfers/carton-selection";
import { TRANSFER_DIRECTIONS, type TransferDirection } from "@/lib/transfers/direction";
import { OTHER_OPTION, SECURITY_MEASURES, TRANSFER_RISKS, TRANSPORT_METHODS } from "@/lib/transfers/planning-options";
import type { summarizeInventoryLocations } from "@/lib/transfers/inventory-locations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SiteOption {
  id: number;
  code: string;
  nom: string;
  organisation: "MINISTERE" | "CEIBA" | "AUTRE";
  latitude: number | null;
  longitude: number | null;
  entrepots: Array<{ id: number; code: string; nom: string; localisation: string | null }>;
}

interface ParticipantOption {
  id: number;
  name: string;
  roleCode: string;
  roleLabel: string;
}

interface TransferCartonPage {
  items: TransferCartonItem[];
  total: number;
  totalDossiers: number;
  unidentifiedDossierCount: number;
  engagedCartonCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const initialState: TransferActionState = {};
const emptyPage: TransferCartonPage = {
  items: [], total: 0, totalDossiers: 0, unidentifiedDossierCount: 0, engagedCartonCount: 0, page: 1, pageSize: 40, totalPages: 1,
};

function warehouseLabel(warehouse: SiteOption["entrepots"][number]) {
  return [warehouse.nom, warehouse.localisation].filter(Boolean).join(" · ");
}

export function NewTransferForm({ sites, inventory, participants }: {
  sites: SiteOption[];
  inventory: ReturnType<typeof summarizeInventoryLocations>;
  participants: { ceiba: ParticipantOption[]; sda: ParticipantOption[] };
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTransferLot, initialState);
  const [direction, setDirection] = useState<TransferDirection>("PRISE_EN_CHARGE");
  const route = TRANSFER_DIRECTIONS[direction];
  const sourceSites = useMemo(() => sites.filter((site) => site.organisation === route.source), [sites, route.source]);
  const destinationSites = useMemo(() => sites.filter((site) => site.organisation === route.destination), [sites, route.destination]);
  const sourceIsMinistry = route.source === "MINISTERE";
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [sourceEntrepotId, setSourceEntrepotId] = useState("none");
  const [destinationSiteId, setDestinationSiteId] = useState(() => {
    const ceiba = sites.filter((site) => site.organisation === "CEIBA");
    return ceiba.length === 1 ? String(ceiba[0].id) : "";
  });
  const [transportMethod, setTransportMethod] = useState("");
  const [plannedRoute, setPlannedRoute] = useState("");
  const [myPosition, setMyPosition] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [routing, setRouting] = useState(false);
  const [routeNote, setRouteNote] = useState("");
  const [risks, setRisks] = useState<Set<string>>(new Set());
  const [measures, setMeasures] = useState<Set<string>>(new Set());
  const [destinationEntrepotId, setDestinationEntrepotId] = useState("none");
  const [includeUnlocated, setIncludeUnlocated] = useState(false);
  const [selected, setSelected] = useState<Map<string, TransferCartonItem>>(new Map());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<TransferCartonPage>(emptyPage);
  const [loading, setLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!state.success || !state.lotId) return;
    toast.success(state.message ?? "Opération créée.");
    router.push(`/transferts/${state.lotId}`);
  }, [state, router]);

  useEffect(() => {
    if (!sourceSiteId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError("");
      try {
        setResults(await fetchCartons({ sourceSiteId, sourceEntrepotId, includeUnlocated, search, page, signal: controller.signal }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults(emptyPage);
        setLoadError(error instanceof Error ? error.message : "Le stock de cartons n'a pas pu être chargé.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [sourceSiteId, sourceEntrepotId, includeUnlocated, search, page]);

  const sourceSite = sourceSites.find((site) => String(site.id) === sourceSiteId);
  const destinationSite = destinationSites.find((site) => String(site.id) === destinationSiteId);
  const selectedTokens = useMemo(() => [...selected.keys()], [selected]);
  const selectedDossierCount = useMemo(() => [...selected.values()].reduce((sum, item) => sum + item.dossierCount, 0), [selected]);
  const allPageSelected = results.items.length > 0 && results.items.every((item) => selected.has(item.token));

  function resetSourceSelection() {
    setSelected(new Map());
    setSearch("");
    setPage(1);
    setResults(emptyPage);
    setLoadError("");
  }

  const sitePoint = (site: SiteOption | undefined): GeoPoint | null => {
    const point = site ? { latitude: site.latitude ?? Number.NaN, longitude: site.longitude ?? Number.NaN } : null;
    return isValidGeoPoint(point) ? point : null;
  };
  const routeOrigin = myPosition ?? sitePoint(sourceSite);
  const routeDestination = sitePoint(destinationSite);
  const googleMapsUrl = routeOrigin && routeDestination ? buildGoogleMapsDirectionsUrl(routeOrigin, routeDestination) : null;

  function locateMe() {
    if (!("geolocation" in navigator)) {
      toast.error("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMyPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocating(false);
        toast.success("Position actuelle retenue comme point de départ de l'itinéraire.");
      },
      () => {
        setLocating(false);
        toast.error("Position refusée ou indisponible. Autorisez la localisation dans le navigateur.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function proposeRoute() {
    if (!routeOrigin || !routeDestination) {
      toast.error(!routeDestination
        ? "Le site de destination n'a pas de position GPS. Renseignez-la dans Administration → Sites."
        : "Le site d'origine n'a pas de position GPS : utilisez « Partir de ma position » ou renseignez-la dans Administration → Sites.");
      return;
    }
    setRouting(true);
    setRouteNote("");
    try {
      const result = await suggestTransferRoute(routeOrigin, routeDestination);
      if (result.summary) {
        const originLabel = myPosition ? "Position actuelle" : sourceSite?.nom ?? "Départ";
        setPlannedRoute(formatRouteText(originLabel, destinationSite?.nom ?? "Destination", result.summary));
        setRouteNote("Trajet le plus rapide selon le réseau routier (OpenStreetMap), hors trafic. Vérifiez le trafic sur Google Maps avant le départ.");
      } else {
        setRouteNote(result.error ?? "Itinéraire indisponible : saisissez-le à la main.");
      }
    } catch {
      setRouteNote("Itinéraire indisponible : saisissez-le à la main.");
    } finally {
      setRouting(false);
    }
  }

  function changeDirection(next: TransferDirection) {
    if (next === direction) return;
    setDirection(next);
    setSourceSiteId("");
    setSourceEntrepotId("none");
    const destinations = sites.filter((site) => site.organisation === TRANSFER_DIRECTIONS[next].destination);
    setDestinationSiteId(destinations.length === 1 ? String(destinations[0].id) : "");
    setDestinationEntrepotId("none");
    resetSourceSelection();
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

  function selectInventoryLocation(siteId: number, entrepotId: number | null) {
    if (sourceSiteId === String(siteId) && sourceEntrepotId === String(entrepotId ?? "none")) return;
    setSourceSiteId(String(siteId));
    setSourceEntrepotId(entrepotId === null ? "none" : String(entrepotId));
    resetSourceSelection();
  }

  function siteLabel(site: SiteOption) {
    const count = inventory.filter((location) => location.siteId === site.id).reduce((sum, location) => sum + location.dossiers, 0);
    return `${site.nom} · ${site.code} · ${count.toLocaleString("fr-FR")} dossiers`;
  }

  function sourceWarehouseLabel(warehouse: SiteOption["entrepots"][number]) {
    const location = inventory.find((item) => item.siteId === Number(sourceSiteId) && item.entrepotId === warehouse.id);
    return `${warehouseLabel(warehouse)} · ${(location?.dossiers ?? 0).toLocaleString("fr-FR")} dossiers`;
  }

  function changeIncludeUnlocated(checked: boolean) {
    setIncludeUnlocated(checked);
    setSelected(new Map());
    setPage(1);
  }

  function toggleCarton(item: TransferCartonItem, checked: boolean) {
    setSelected((current) => {
      const next = new Map(current);
      if (checked) {
        if (next.size >= MAX_TRANSFER_CARTONS && !next.has(item.token)) {
          toast.error(`Une opération est limitée à ${MAX_TRANSFER_CARTONS} cartons.`);
          return current;
        }
        next.set(item.token, item);
      } else {
        next.delete(item.token);
      }
      return next;
    });
  }

  function toggleCurrentPage() {
    setSelected((current) => {
      const next = new Map(current);
      if (allPageSelected) {
        results.items.forEach((item) => next.delete(item.token));
      } else {
        for (const item of results.items) {
          if (next.size >= MAX_TRANSFER_CARTONS) break;
          next.set(item.token, item);
        }
      }
      return next;
    });
  }

  async function proposeBatch() {
    if (!sourceSiteId) return;
    setProposing(true);
    setLoadError("");
    try {
      const proposal = await fetchCartons({ sourceSiteId, sourceEntrepotId, includeUnlocated, search, page: 1, proposal: true });
      setSelected(new Map(proposal.items.map((item) => [item.token, item])));
      const dossiers = proposal.items.reduce((sum, item) => sum + item.dossierCount, 0);
      toast.success(`${proposal.items.length} carton${proposal.items.length > 1 ? "s" : ""} proposé${proposal.items.length > 1 ? "s" : ""}, soit ${dossiers} dossiers.`);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "La proposition n'a pas pu être générée.");
    } finally {
      setProposing(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="cartonTokens" value={JSON.stringify(selectedTokens)} />
      <input type="hidden" name="includeUnlocated" value={String(includeUnlocated)} />
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}

      <input type="hidden" name="direction" value={direction} />
      <section className="space-y-3 rounded-lg border bg-card p-4 lg:p-5">
        <div><h2 className="font-semibold">Sens du transfert</h2><p className="text-sm text-muted-foreground">Le circuit est le même dans les deux sens : visa interne, visa SDA, bon de sortie F02, procès-verbal de réception F03 contre-signé.</p></div>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Sens du transfert">
          {(Object.keys(TRANSFER_DIRECTIONS) as TransferDirection[]).map((key) => (
            <Button key={key} type="button" role="radio" aria-checked={direction === key} variant={direction === key ? "secondary" : "outline"} className="h-auto justify-start whitespace-normal py-3 text-left" onClick={() => changeDirection(key)} disabled={pending}>
              {TRANSFER_DIRECTIONS[key].label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 lg:p-5">
        <div>
          <h2 className="font-semibold">Où se trouvent les cartons inventoriés ?</h2>
          <p className="text-sm text-muted-foreground">Tous les dossiers de l’inventaire sont comptés, sans condition de préparation, numérisation ou indexation. Choisissez une salle pour retrouver ses cartons.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {sites.map((site) => {
            const locations = inventory.filter((location) => location.siteId === site.id);
            return <div key={site.id} className="space-y-2 rounded-md border p-3">
              <h3 className="text-sm font-semibold">{siteLabel(site)}</h3>
              {locations.length === 0 ? <p className="text-xs text-muted-foreground">Aucun dossier à cet emplacement.</p> : locations.map((location) => {
                const warehouse = site.entrepots.find((item) => item.id === location.entrepotId);
                const label = location.entrepotId === null ? "Sans salle renseignée" : warehouse ? warehouseLabel(warehouse) : "Salle inactive ou non disponible";
                return <Button key={location.entrepotId ?? "none"} type="button" variant={sourceSiteId === String(site.id) && sourceEntrepotId === String(location.entrepotId ?? "none") ? "secondary" : "outline"} className="h-auto w-full justify-between whitespace-normal py-2 text-left" disabled={pending || site.organisation !== route.source || (location.entrepotId !== null && !warehouse)} onClick={() => selectInventoryLocation(site.id, location.entrepotId)}>
                  <span>{label}</span>
                  <span className="ml-2 text-xs">{location.cartons.toLocaleString("fr-FR")} cartons · {location.dossiers.toLocaleString("fr-FR")} dossiers</span>
                </Button>;
              })}
              {site.organisation !== route.source && locations.length > 0 ? <p className="text-xs text-muted-foreground">Stock visible. Dans le sens choisi, l’opération part d’un site {sourceIsMinistry ? "du ministère" : "CEIBA"}.</p> : null}
            </div>;
          })}
        </div>
        <p className="text-xs text-muted-foreground">Les cartons sont identifiés par code-barres, ou par libellé en l’absence de code, dans chaque emplacement. Les cartons déjà engagés dans un transfert sont comptés dans l’inventaire mais ne peuvent pas être engagés une seconde fois.</p>
      </section>

      <section className="grid gap-5 rounded-lg border bg-card p-4 shadow-sm lg:grid-cols-[1fr_auto_1fr] lg:items-start lg:p-5">
        <div className="space-y-4">
          <div><h2 className="font-semibold">{sourceIsMinistry ? "Site du ministère" : "Site CEIBA"} · origine</h2><p className="text-sm text-muted-foreground">Site qui détient actuellement les cartons.</p></div>
          <div className="space-y-2">
            <Label>{sourceIsMinistry ? "Site du ministère" : "Site CEIBA"}</Label>
            <Select name="sourceSiteId" items={sourceSites.map((site) => ({ label: siteLabel(site), value: String(site.id) }))} value={sourceSiteId} onValueChange={changeSourceSite} disabled={pending}>
              <SelectTrigger className="w-full"><SelectValue placeholder={sourceIsMinistry ? "Choisir le site du ministère" : "Choisir le site CEIBA"} /></SelectTrigger>
              <SelectContent>{sourceSites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{siteLabel(site)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle d&apos;origine</Label>
            <Select name="sourceEntrepotId" items={[{ label: "Uniquement les dossiers sans salle renseignée", value: "none" }, ...(sourceSite?.entrepots ?? []).map((warehouse) => ({ label: sourceWarehouseLabel(warehouse), value: String(warehouse.id) }))]} value={sourceEntrepotId} onValueChange={changeSourceWarehouse} disabled={pending || !sourceSite}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Uniquement les dossiers sans salle renseignée</SelectItem>{sourceSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{sourceWarehouseLabel(warehouse)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="hidden h-full items-center text-muted-foreground lg:flex"><ArrowRight className="mt-16 h-6 w-6" /></div>

        <div className="space-y-4">
          <div><h2 className="font-semibold">{sourceIsMinistry ? "Site CEIBA" : "Site du ministère"} · destination</h2><p className="text-sm text-muted-foreground">Site qui intégrera le stock après réception signée.</p></div>
          <div className="space-y-2">
            <Label>{sourceIsMinistry ? "Site CEIBA" : "Site du ministère"}</Label>
            <Select name="destinationSiteId" items={destinationSites.map((site) => ({ label: `${site.nom} · ${site.code}`, value: String(site.id) }))} value={destinationSiteId} onValueChange={(value) => { setDestinationSiteId(value ?? ""); setDestinationEntrepotId("none"); }} disabled={pending}>
              <SelectTrigger className="w-full"><SelectValue placeholder={sourceIsMinistry ? "Choisir le site CEIBA" : "Choisir le site du ministère"} /></SelectTrigger>
              <SelectContent>{destinationSites.map((site) => <SelectItem key={site.id} value={String(site.id)}>{site.nom} · {site.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Entrepôt / salle de destination</Label>
            <Select name="destinationEntrepotId" items={[{ label: "Sans entrepôt précisé", value: "none" }, ...(destinationSite?.entrepots ?? []).map((warehouse) => ({ label: warehouseLabel(warehouse), value: String(warehouse.id) }))]} value={destinationEntrepotId} onValueChange={(value) => setDestinationEntrepotId(value ?? "none")} disabled={pending || !destinationSite}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sans entrepôt précisé</SelectItem>{destinationSite?.entrepots.map((warehouse) => <SelectItem key={warehouse.id} value={String(warehouse.id)}>{warehouseLabel(warehouse)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-end lg:justify-between lg:p-5">
          <div><h2 className="font-semibold">Cartons disponibles au site d&apos;origine</h2><p className="text-sm text-muted-foreground">Un carton sélectionné inclut automatiquement tous les dossiers qu&apos;il contient.</p></div>
          <div className="relative w-full lg:w-96"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="ID carton, code-barres ou libellé" className="pl-9" disabled={!sourceSiteId} /></div>
        </div>

        <div className="space-y-3 border-b bg-muted/20 px-4 py-3 lg:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary" className="rounded-md">{selected.size}/{MAX_TRANSFER_CARTONS} cartons</Badge>
              <Badge variant="outline" className="rounded-md">{selectedDossierCount} dossiers inclus</Badge>
              <span className="text-muted-foreground">{sourceSiteId ? `${results.total} carton${results.total > 1 ? "s" : ""} disponible${results.total > 1 ? "s" : ""}` : "Choisissez le site d'origine pour charger le stock"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {results.items.length > 0 ? <Button type="button" size="sm" variant="outline" onClick={toggleCurrentPage}>{allPageSelected ? "Retirer cette page" : "Sélectionner cette page"}</Button> : null}
              <Button type="button" size="sm" onClick={proposeBatch} disabled={!sourceSiteId || proposing || pending}>
                {proposing ? <Loader2 className="animate-spin" /> : <ListChecks />}
                Proposer jusqu&apos;à 200 cartons
              </Button>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border/70 bg-background/70 p-3 text-sm">
            <Checkbox checked={includeUnlocated} onCheckedChange={(value) => changeIncludeUnlocated(value === true)} disabled={pending} />
            <span><span className="block font-medium">Inclure le stock historique sans emplacement</span><span className="mt-0.5 block text-xs text-muted-foreground">Ces dossiers ne sont retenus que s&apos;ils appartiennent à un carton identifié; ils seront rattachés au site d&apos;origine à la validation.</span></span>
          </label>
        </div>

        {results.unidentifiedDossierCount > 0 ? <Alert className="m-4 lg:m-5"><AlertDescription>{results.unidentifiedDossierCount} dossier(s) sans code-barres ni libellé de carton sont exclus. Leur contenant doit être identifié avant transfert.</AlertDescription></Alert> : null}
        {results.engagedCartonCount > 0 ? <Alert className="m-4 lg:m-5"><AlertDescription>{results.engagedCartonCount} carton(s) de cet emplacement sont déjà engagés dans un transfert ouvert. Retrouvez-les dans le registre des transferts.</AlertDescription></Alert> : null}
        {loadError ? <Alert variant="destructive" className="m-4 lg:m-5"><AlertDescription>{loadError}</AlertDescription></Alert> : null}
        {!sourceSiteId ? (
          <EmptyState title="Point de départ requis" description="Le stock affiché dépend du site et de la salle d'origine." />
        ) : loading ? (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="animate-spin" /> Chargement des cartons...</div>
        ) : results.items.length === 0 && !loadError ? (
          <EmptyState title="Aucun carton disponible" description="Modifiez la recherche ou vérifiez l'emplacement sélectionné." />
        ) : (
          <>
            <div className="divide-y lg:hidden">{results.items.map((item) => <CartonMobileRow key={item.token} item={item} checked={selected.has(item.token)} disabled={pending} onToggle={toggleCarton} />)}</div>
            <div className="hidden overflow-x-auto lg:block">
              <Table className="min-w-[760px]">
                <TableHeader><TableRow className="bg-muted/35 hover:bg-muted/35"><TableHead className="w-12 pl-5" /><TableHead>Identifiant carton</TableHead><TableHead>Libellé</TableHead><TableHead className="text-center">Dossiers inclus</TableHead><TableHead className="pr-5">Localisation</TableHead></TableRow></TableHeader>
                <TableBody>{results.items.map((item) => (
                  <TableRow key={item.token} className="hover:bg-accent/25">
                    <TableCell className="pl-5"><Checkbox checked={selected.has(item.token)} onCheckedChange={(value) => toggleCarton(item, value === true)} disabled={pending} aria-label={`Sélectionner le carton ${item.code}`} /></TableCell>
                    <TableCell><p className="font-mono font-semibold">{item.code}</p><p className="mt-1 text-xs text-muted-foreground">Contenant physique identifié</p></TableCell>
                    <TableCell>{item.label ?? <span className="text-muted-foreground">Sans libellé distinct</span>}</TableCell>
                    <TableCell className="text-center"><span className="font-semibold tabular-nums">{item.dossierCount}</span><span className="text-muted-foreground"> dossier{item.dossierCount > 1 ? "s" : ""}</span></TableCell>
                    <TableCell className="pr-5">{item.unlocatedDossierCount > 0 ? <Badge variant="outline" className="rounded-md">{item.unlocatedDossierCount} à rattacher</Badge> : <span className="text-sm text-muted-foreground">Site et salle sélectionnés</span>}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </>
        )}

        {sourceSiteId && !loadError ? <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-5"><p className="text-sm text-muted-foreground">Page <strong className="text-foreground">{results.page}</strong> sur <strong className="text-foreground">{results.totalPages}</strong> · {results.totalDossiers} dossiers répartis dans les cartons filtrés</p><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || results.page <= 1}><ChevronLeft /> Précédent</Button><Button type="button" size="sm" variant="outline" onClick={() => setPage((value) => Math.min(results.totalPages, value + 1))} disabled={loading || results.page >= results.totalPages}>Suivant <ChevronRight /></Button></div></div> : null}
      </section>

      <section className="space-y-5 rounded-lg border bg-card p-4 shadow-sm lg:p-5">
        <div><h2 className="font-semibold">Planification et sécurisation</h2><p className="mt-1 text-sm text-muted-foreground">Renseignez les dispositions validées avec le SDA avant de soumettre l&apos;opération.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="plannedAt">Date de transfert prévue</Label><Input id="plannedAt" name="plannedAt" type="datetime-local" required disabled={pending} /></div>
          <div className="space-y-2"><Label htmlFor="archiveSupport">Support des archives</Label><select id="archiveSupport" name="archiveSupport" defaultValue="PHYSIQUE" required disabled={pending} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="PHYSIQUE">Physique</option><option value="ELECTRONIQUE">Électronique</option><option value="HYBRIDE">Hybride</option></select></div>
          <div className="space-y-2">
            <Label htmlFor="transportMethod">Moyen de transport prévu</Label>
            <select id="transportMethod" name="transportMethod" value={transportMethod} onChange={(event) => setTransportMethod(event.target.value)} required disabled={pending} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="" disabled>Choisir le moyen de transport</option>
              {TRANSPORT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              <option value={OTHER_OPTION}>Autre (préciser)</option>
            </select>
            {transportMethod === OTHER_OPTION ? <Input name="transportMethodOther" required minLength={2} maxLength={300} placeholder="Préciser le moyen de transport" disabled={pending} /> : null}
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="plannedRoute">Itinéraire prévu</Label>
            <Input id="plannedRoute" name="plannedRoute" required maxLength={2000} value={plannedRoute} onChange={(event) => setPlannedRoute(event.target.value)} placeholder="Site de départ, trajet autorisé et site de destination" disabled={pending} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={proposeRoute} disabled={pending || routing || !sourceSite || !destinationSite}>
                {routing ? <Loader2 className="animate-spin" /> : <Route />} Proposer l&apos;itinéraire
              </Button>
              <Button type="button" size="sm" variant={myPosition ? "secondary" : "ghost"} onClick={locateMe} disabled={pending || locating}>
                {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} {myPosition ? "Départ : ma position" : "Partir de ma position"}
              </Button>
              {googleMapsUrl ? <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">Voir sur Google Maps (trafic en temps réel) <ExternalLink className="h-3.5 w-3.5" /></a> : null}
            </div>
            {routeNote ? <p className="text-xs text-muted-foreground">{routeNote}</p> : null}
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3"><Label htmlFor="motif">Objet / contexte</Label><Input id="motif" name="motif" maxLength={2000} placeholder={sourceIsMinistry ? "Numérisation, indexation, garde temporaire..." : "Restitution après numérisation, réintégration au site..."} disabled={pending} /></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ParticipantPicker name="ceibaParticipantIds" title="Intervenants CEIBA habilités" options={participants.ceiba} disabled={pending} emptyHint="Aucun compte CEIBA actif avec un profil de transfert (gestionnaire, validateur interne, convoyeur)." />
          <ParticipantPicker name="sdaParticipantIds" title="Intervenants SDA habilités" options={participants.sda} disabled={pending} emptyHint="Aucun compte SDA actif avec un profil de transfert (gestionnaire SDA, responsable validation SDA)." />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChoiceGroup name="risks" otherName="riskOther" title="Risques identifiés" options={TRANSFER_RISKS} selected={risks} onChange={setRisks} disabled={pending} />
          <ChoiceGroup name="securityMeasures" otherName="securityMeasureOther" title="Mesures de sécurisation" options={SECURITY_MEASURES} selected={measures} onChange={setMeasures} disabled={pending} />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Après création, l&apos;opération est soumise à la validation interne, puis transmise à la validation SDA. Le stock du site d&apos;origine diminue uniquement après le bon de sortie contre-signé ; celui du site de destination augmente après l&apos;attestation de réception validée. Les administrateurs attribuent les profils de transfert dans Administration → Utilisateurs.</p>
      </section>

      <div className="flex justify-end"><Button type="submit" disabled={pending || selected.size === 0 || !sourceSiteId || !destinationSiteId}>{pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}Valider la sélection · {selected.size} carton{selected.size > 1 ? "s" : ""} / {selectedDossierCount} dossiers</Button></div>
    </form>
  );
}

async function fetchCartons(options: { sourceSiteId: string; sourceEntrepotId: string; includeUnlocated: boolean; search: string; page: number; proposal?: boolean; signal?: AbortSignal }) {
  const params = new URLSearchParams({ site: options.sourceSiteId, entrepot: options.sourceEntrepotId, page: String(options.page) });
  if (options.includeUnlocated) params.set("unlocated", "1");
  if (options.search.trim()) params.set("q", options.search.trim());
  if (options.proposal) params.set("proposal", "1");
  const response = await fetch(`/api/transferts/cartons?${params}`, { signal: options.signal });
  const payload = await response.json() as TransferCartonPage | { error?: string };
  if (!response.ok || !("items" in payload)) throw new Error("error" in payload ? payload.error : "Chargement impossible.");
  return payload;
}

function ParticipantPicker({ name, title, options, disabled, emptyHint }: { name: string; title: string; options: ParticipantOption[]; disabled: boolean; emptyHint: string }) {
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {options.length === 0 ? <p className="text-xs text-muted-foreground">{emptyHint}</p> : (
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
              <Checkbox name={name} value={String(option.id)} disabled={disabled} />
              <span className="min-w-0 flex-1"><span className="font-medium">{option.name}</span><span className="ml-2 text-xs text-muted-foreground">{option.roleLabel}</span></span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function ChoiceGroup({ name, otherName, title, options, selected, onChange, disabled }: {
  name: string;
  otherName: string;
  title: string;
  options: readonly { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled: boolean;
}) {
  function toggle(value: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(value); else next.delete(value);
    onChange(next);
  }
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {[...options, { value: OTHER_OPTION, label: "Autre (préciser)" }].map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
            <Checkbox name={name} value={option.value} checked={selected.has(option.value)} onCheckedChange={(value) => toggle(option.value, value === true)} disabled={disabled} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {selected.has(OTHER_OPTION) ? <Input name={otherName} required minLength={2} maxLength={300} placeholder="Préciser" disabled={disabled} /> : null}
    </fieldset>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="px-5 py-14 text-center"><Boxes className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}

function CartonMobileRow({ item, checked, disabled, onToggle }: { item: TransferCartonItem; checked: boolean; disabled: boolean; onToggle: (item: TransferCartonItem, checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/35"><Checkbox checked={checked} onCheckedChange={(value) => onToggle(item, value === true)} disabled={disabled} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono">{item.code}</strong><Badge variant="outline" className="rounded-md">{item.dossierCount} dossier{item.dossierCount > 1 ? "s" : ""}</Badge></span><span className="mt-1 block text-sm text-muted-foreground">{item.label ?? "Sans libellé distinct"}</span>{item.unlocatedDossierCount > 0 ? <span className="mt-1 block text-xs text-brand-gold">{item.unlocatedDossierCount} dossier(s) historique(s) à rattacher</span> : null}</span></label>;
}
