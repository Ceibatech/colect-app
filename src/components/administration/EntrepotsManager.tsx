"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createEntrepot, updateEntrepot, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface EntrepotRow {
  id: number;
  siteId: number;
  code: string;
  nom: string;
  typeEntrepot: string | null;
  description: string | null;
  isActive: boolean;
  anneeMiseEnService: number | null;
  responsable: string | null;
  telephone: string | null;
  email: string | null;
  surfaceM2: number | null;
  longueur: number | null;
  largeur: number | null;
  hauteurSousPlafond: number | null;
  nombreNiveaux: number | null;
  nombreSalles: number | null;
  nombreZonesArchivage: number | null;
  nombreRayonnages: number | null;
  nombreTravees: number | null;
  nombreEtageres: number | null;
  capaciteCartonsMax: number | null;
  capaciteBoitesMax: number | null;
  capaciteTheorique: number | null;
  // Conditions de conservation
  temperatureMoyenne: number | null;
  temperatureMin: number | null;
  temperatureMax: number | null;
  systemeClimatisation: boolean | null;
  climatisationFonctionnelle: boolean | null;
  humiditeMoyenne: number | null;
  humiditeMin: number | null;
  humiditeMax: number | null;
  deshumidificateur: boolean | null;
  systemeControleHumidite: boolean | null;
  protectionEau: boolean | null;
  protectionInfiltrations: boolean | null;
  etancheiteBatiment: boolean | null;
  protectionPoussiere: boolean | null;
  protectionNuisibles: boolean | null;
  // Sécurité de l'entrepôt
  extincteursDisponibles: boolean | null;
  nombreExtincteurs: number | null;
  detecteursFumee: boolean | null;
  systemeAlarmeIncendie: boolean | null;
  systemeExtinctionAutomatique: boolean | null;
  dateDernierControleIncendie: string | null; // ISO (YYYY-MM-DD), déjà sérialisé par la page
  dateProchainControleIncendie: string | null;
  gardiennage: boolean | null;
  videosurveillance: boolean | null;
  nombreCameras: number | null;
  alarmeAntiIntrusion: boolean | null;
  controleAcces: boolean | null;
  badge: boolean | null;
  serrureSecurisee: boolean | null;
  registreVisiteurs: boolean | null;
  // Calculés côté serveur (jamais saisis) — voir listAllEntrepots().
  cartonsOccupes: number;
  capaciteDisponible: number | null;
  tauxOccupation: number | null;
  site: { id: number; nom: string };
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

// Non contraignant — la fiche métier donne "Principal / secondaire" comme
// exemple, pas comme liste fermée.
const TYPE_ENTREPOT_SUGGESTIONS = ["Principal", "Secondaire"];

/** Case à cocher compacte pour les listes "Conditions de conservation" / "Sécurité". */
function CheckField({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked ?? false} disabled={disabled} />
      <Label htmlFor={name} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function EntrepotForm({
  action,
  sites,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  sites: Array<{ id: number; nom: string }>;
  defaultValues?: Partial<EntrepotRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const siteItems = sites.map((s) => ({ label: s.nom, value: String(s.id) }));

  // `onSuccess` doit être mémoïsé (useCallback) côté appelant — voir
  // CommunesManager.tsx pour le détail.
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="siteId">Site</Label>
        <Select name="siteId" items={siteItems} defaultValue={defaultValues?.siteId ? String(defaultValues.siteId) : undefined} disabled={isPending}>
          <SelectTrigger className="w-full" id="siteId">
            <SelectValue placeholder="Choisir un site" />
          </SelectTrigger>
          <SelectContent>
            {siteItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Code entrepôt</Label>
          <Input id="code" name="code" placeholder="ENT-001" defaultValue={defaultValues?.code} maxLength={20} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" name="nom" placeholder="Entrepôt central" defaultValue={defaultValues?.nom} maxLength={150} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="typeEntrepot">Type</Label>
          <Input
            id="typeEntrepot"
            name="typeEntrepot"
            list="type-entrepot-datalist"
            placeholder="Principal"
            defaultValue={defaultValues?.typeEntrepot ?? ""}
            maxLength={100}
            disabled={isPending}
          />
          <datalist id="type-entrepot-datalist">
            {TYPE_ENTREPOT_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="anneeMiseEnService">Année de mise en service</Label>
          <Input
            id="anneeMiseEnService"
            name="anneeMiseEnService"
            type="number"
            min={1900}
            max={2100}
            placeholder="2022"
            defaultValue={defaultValues?.anneeMiseEnService ?? ""}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Dépôt des archives foncières"
          defaultValue={defaultValues?.description ?? ""}
          rows={2}
          disabled={isPending}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} disabled={isPending} />
        <Label htmlFor="isActive" className="font-normal">
          Actif (proposé dans la Collecte)
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="responsable">Responsable</Label>
          <Input id="responsable" name="responsable" placeholder="Nom Prénom" defaultValue={defaultValues?.responsable ?? ""} maxLength={150} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="telephone">Téléphone</Label>
          <Input id="telephone" name="telephone" placeholder="07 XX XX XX XX" defaultValue={defaultValues?.telephone ?? ""} maxLength={30} disabled={isPending} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" placeholder="responsable@..." defaultValue={defaultValues?.email ?? ""} maxLength={150} disabled={isPending} />
        </div>
      </div>

      {/* Caractéristiques physiques (Phase 17+) — "on cherche à connaître la
          capacité réelle du lieu". Champs déclaratifs uniquement : l'espace
          occupé/disponible et le taux d'occupation ne se saisissent pas ici,
          ils sont recalculés en direct à partir des cartons réellement
          rattachés à cet entrepôt (voir le tableau ci-dessous). */}
      <div className="space-y-3 rounded-md border p-3">
        <Label className="text-sm font-medium">Dimensions</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="surfaceM2">Surface totale (m²)</Label>
            <Input id="surfaceM2" name="surfaceM2" type="number" step="any" min={0} placeholder="1200" defaultValue={defaultValues?.surfaceM2 ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="longueur">Longueur (m)</Label>
            <Input id="longueur" name="longueur" type="number" step="any" min={0} defaultValue={defaultValues?.longueur ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="largeur">Largeur (m)</Label>
            <Input id="largeur" name="largeur" type="number" step="any" min={0} defaultValue={defaultValues?.largeur ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hauteurSousPlafond">Hauteur sous plafond (m)</Label>
            <Input id="hauteurSousPlafond" name="hauteurSousPlafond" type="number" step="any" min={0} defaultValue={defaultValues?.hauteurSousPlafond ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombreNiveaux">Nombre de niveaux</Label>
            <Input id="nombreNiveaux" name="nombreNiveaux" type="number" min={0} defaultValue={defaultValues?.nombreNiveaux ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombreSalles">Nombre de salles</Label>
            <Input id="nombreSalles" name="nombreSalles" type="number" min={0} defaultValue={defaultValues?.nombreSalles ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombreZonesArchivage">Nombre de zones d&apos;archivage</Label>
            <Input id="nombreZonesArchivage" name="nombreZonesArchivage" type="number" min={0} defaultValue={defaultValues?.nombreZonesArchivage ?? ""} disabled={isPending} />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <Label className="text-sm font-medium">Capacité</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="nombreRayonnages">Nombre de rayonnages</Label>
            <Input id="nombreRayonnages" name="nombreRayonnages" type="number" min={0} placeholder="85" defaultValue={defaultValues?.nombreRayonnages ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombreTravees">Nombre de travées</Label>
            <Input id="nombreTravees" name="nombreTravees" type="number" min={0} placeholder="420" defaultValue={defaultValues?.nombreTravees ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nombreEtageres">Nombre d&apos;étagères</Label>
            <Input id="nombreEtageres" name="nombreEtageres" type="number" min={0} defaultValue={defaultValues?.nombreEtageres ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capaciteCartonsMax">Nombre de cartons maximum</Label>
            <Input id="capaciteCartonsMax" name="capaciteCartonsMax" type="number" min={0} placeholder="12000" defaultValue={defaultValues?.capaciteCartonsMax ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capaciteBoitesMax">Nombre de boîtes maximum</Label>
            <Input id="capaciteBoitesMax" name="capaciteBoitesMax" type="number" min={0} defaultValue={defaultValues?.capaciteBoitesMax ?? ""} disabled={isPending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capaciteTheorique">Capacité théorique</Label>
            <Input id="capaciteTheorique" name="capaciteTheorique" type="number" min={0} defaultValue={defaultValues?.capaciteTheorique ?? ""} disabled={isPending} />
          </div>
        </div>
        {defaultValues?.id ? (
          <p className="text-xs text-muted-foreground">
            Cartons occupés : <span className="font-medium text-foreground">{defaultValues.cartonsOccupes ?? 0}</span>
            {defaultValues.tauxOccupation != null ? ` (${defaultValues.tauxOccupation}% de la capacité déclarée)` : ""} — calculé
            automatiquement à partir des dossiers rattachés, non modifiable ici.
          </p>
        ) : null}
      </div>

      {/* Conditions de conservation (Phase 17+) — "pour un entrepôt d'archives" */}
      <div className="space-y-4 rounded-md border p-3">
        <Label className="text-sm font-medium">Conditions de conservation</Label>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Température</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="temperatureMoyenne">Moyenne (°C)</Label>
              <Input id="temperatureMoyenne" name="temperatureMoyenne" type="number" step="any" defaultValue={defaultValues?.temperatureMoyenne ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperatureMin">Minimale (°C)</Label>
              <Input id="temperatureMin" name="temperatureMin" type="number" step="any" defaultValue={defaultValues?.temperatureMin ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="temperatureMax">Maximale (°C)</Label>
              <Input id="temperatureMax" name="temperatureMax" type="number" step="any" defaultValue={defaultValues?.temperatureMax ?? ""} disabled={isPending} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <CheckField name="systemeClimatisation" label="Système de climatisation" defaultChecked={defaultValues?.systemeClimatisation} disabled={isPending} />
            <CheckField name="climatisationFonctionnelle" label="Climatisation fonctionnelle ?" defaultChecked={defaultValues?.climatisationFonctionnelle} disabled={isPending} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Humidité</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="humiditeMoyenne">Taux moyen (%)</Label>
              <Input id="humiditeMoyenne" name="humiditeMoyenne" type="number" step="any" min={0} max={100} defaultValue={defaultValues?.humiditeMoyenne ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="humiditeMin">Taux minimum (%)</Label>
              <Input id="humiditeMin" name="humiditeMin" type="number" step="any" min={0} max={100} defaultValue={defaultValues?.humiditeMin ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="humiditeMax">Taux maximum (%)</Label>
              <Input id="humiditeMax" name="humiditeMax" type="number" step="any" min={0} max={100} defaultValue={defaultValues?.humiditeMax ?? ""} disabled={isPending} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
            <CheckField name="deshumidificateur" label="Déshumidificateur" defaultChecked={defaultValues?.deshumidificateur} disabled={isPending} />
            <CheckField name="systemeControleHumidite" label="Système de contrôle de l'humidité" defaultChecked={defaultValues?.systemeControleHumidite} disabled={isPending} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Protection</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <CheckField name="protectionEau" label="Protection contre l'eau" defaultChecked={defaultValues?.protectionEau} disabled={isPending} />
            <CheckField name="protectionInfiltrations" label="Protection contre les infiltrations" defaultChecked={defaultValues?.protectionInfiltrations} disabled={isPending} />
            <CheckField name="etancheiteBatiment" label="Étanchéité du bâtiment" defaultChecked={defaultValues?.etancheiteBatiment} disabled={isPending} />
            <CheckField name="protectionPoussiere" label="Protection contre la poussière" defaultChecked={defaultValues?.protectionPoussiere} disabled={isPending} />
            <CheckField name="protectionNuisibles" label="Protection contre les nuisibles" defaultChecked={defaultValues?.protectionNuisibles} disabled={isPending} />
          </div>
        </div>
      </div>

      {/* Sécurité de l'entrepôt (Phase 17+) */}
      <div className="space-y-4 rounded-md border p-3">
        <Label className="text-sm font-medium">Sécurité de l&apos;entrepôt</Label>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Incendie</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <CheckField name="extincteursDisponibles" label="Extincteurs disponibles" defaultChecked={defaultValues?.extincteursDisponibles} disabled={isPending} />
            <CheckField name="detecteursFumee" label="Détecteurs de fumée" defaultChecked={defaultValues?.detecteursFumee} disabled={isPending} />
            <CheckField name="systemeAlarmeIncendie" label="Système d'alarme incendie" defaultChecked={defaultValues?.systemeAlarmeIncendie} disabled={isPending} />
            <CheckField name="systemeExtinctionAutomatique" label="Système automatique d'extinction" defaultChecked={defaultValues?.systemeExtinctionAutomatique} disabled={isPending} />
          </div>
          <div className="grid gap-4 pt-1 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="nombreExtincteurs">Nombre d&apos;extincteurs</Label>
              <Input id="nombreExtincteurs" name="nombreExtincteurs" type="number" min={0} defaultValue={defaultValues?.nombreExtincteurs ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateDernierControleIncendie">Date du dernier contrôle</Label>
              <Input id="dateDernierControleIncendie" name="dateDernierControleIncendie" type="date" defaultValue={defaultValues?.dateDernierControleIncendie ?? ""} disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateProchainControleIncendie">Date du prochain contrôle</Label>
              <Input id="dateProchainControleIncendie" name="dateProchainControleIncendie" type="date" defaultValue={defaultValues?.dateProchainControleIncendie ?? ""} disabled={isPending} />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Sécurité physique</p>
          <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <CheckField name="gardiennage" label="Gardiennage" defaultChecked={defaultValues?.gardiennage} disabled={isPending} />
            <CheckField name="videosurveillance" label="Vidéosurveillance" defaultChecked={defaultValues?.videosurveillance} disabled={isPending} />
            <CheckField name="alarmeAntiIntrusion" label="Alarme anti-intrusion" defaultChecked={defaultValues?.alarmeAntiIntrusion} disabled={isPending} />
            <CheckField name="controleAcces" label="Contrôle d'accès" defaultChecked={defaultValues?.controleAcces} disabled={isPending} />
            <CheckField name="badge" label="Badge" defaultChecked={defaultValues?.badge} disabled={isPending} />
            <CheckField name="serrureSecurisee" label="Serrure sécurisée" defaultChecked={defaultValues?.serrureSecurisee} disabled={isPending} />
            <CheckField name="registreVisiteurs" label="Registre des visiteurs" defaultChecked={defaultValues?.registreVisiteurs} disabled={isPending} />
          </div>
          <div className="grid gap-4 pt-1 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="nombreCameras">Nombre de caméras</Label>
              <Input id="nombreCameras" name="nombreCameras" type="number" min={0} defaultValue={defaultValues?.nombreCameras ?? ""} disabled={isPending} />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EntrepotsManager({ entrepots, sites }: { entrepots: EntrepotRow[]; sites: Array<{ id: number; nom: string }> }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Entrepôt créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Entrepôt mis à jour.");
    router.refresh();
  }, [router]);

  const editing = entrepots.find((e) => e.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={sites.length === 0}><Plus className="mr-1 h-4 w-4" />Nouvel entrepôt</Button>} />
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvel entrepôt</DialogTitle>
              <DialogDescription>Rattaché à un site existant — un site peut avoir plusieurs entrepôts.</DialogDescription>
            </DialogHeader>
            <EntrepotForm action={createEntrepot} sites={sites} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>
      {sites.length === 0 ? (
        <Alert>
          <AlertDescription>Créez d&apos;abord au moins un site avant d&apos;ajouter un entrepôt.</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Dossiers</TableHead>
              <TableHead>Occupation</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entrepots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun entrepôt.
                </TableCell>
              </TableRow>
            ) : (
              entrepots.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.code}</TableCell>
                  <TableCell className="font-medium">{e.nom}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.typeEntrepot ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.site.nom}</TableCell>
                  <TableCell>{e._count.dossiers}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.capaciteCartonsMax != null ? (
                      <>
                        {e.cartonsOccupes} / {e.capaciteCartonsMax}
                        {e.tauxOccupation != null ? ` (${e.tauxOccupation}%)` : ""}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.isActive ? "default" : "secondary"}>{e.isActive ? "Actif" : "Inactif"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(e.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;entrepôt</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code s&apos;il est déjà utilisé par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <EntrepotForm action={updateEntrepot.bind(null, editing.id)} sites={sites} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
