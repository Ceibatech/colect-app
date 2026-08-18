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
import { createSite, updateSite, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface SiteRow {
  id: number;
  code: string;
  nom: string;
  typeSite: string | null;
  description: string | null;
  isActive: boolean;
  dateMiseEnService: string | null; // ISO (YYYY-MM-DD), déjà sérialisé par la page
  responsable: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  communeId: number | null;
  quartier: string | null;
  ville: string | null;
  region: string | null;
  commune: { id: number; nom: string } | null;
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

// Suggestions non contraignantes (issues des exemples métier) — le champ
// reste en saisie libre, "etc." dans la fiche fournie indique une liste non
// exhaustive qu'on ne doit pas figer en liste fermée.
const TYPE_SITE_SUGGESTIONS = ["Siège", "Dépôt", "Antenne"];

function SiteForm({
  action,
  communes,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  communes: Array<{ id: number; nom: string }>;
  defaultValues?: Partial<SiteRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const communeItems = communes.map((c) => ({ label: c.nom, value: String(c.id) }));

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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="code">Code site</Label>
          <Input id="code" name="code" placeholder="SITE-001" defaultValue={defaultValues?.code} maxLength={20} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nom">Nom du site</Label>
          <Input id="nom" name="nom" placeholder="Site central MULCV" defaultValue={defaultValues?.nom} maxLength={150} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="typeSite">Type de site</Label>
          <Input
            id="typeSite"
            name="typeSite"
            list="type-site-datalist"
            placeholder="Dépôt d'archives"
            defaultValue={defaultValues?.typeSite ?? ""}
            maxLength={100}
            disabled={isPending}
          />
          <datalist id="type-site-datalist">
            {TYPE_SITE_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateMiseEnService">Date de mise en service</Label>
          <Input
            id="dateMiseEnService"
            name="dateMiseEnService"
            type="date"
            defaultValue={defaultValues?.dateMiseEnService ?? ""}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Dépôt principal des archives"
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
          <Label htmlFor="responsable">Responsable du site</Label>
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

      <div className="space-y-2">
        <Label htmlFor="adresse">Adresse</Label>
        <Textarea id="adresse" name="adresse" defaultValue={defaultValues?.adresse ?? ""} rows={2} disabled={isPending} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="communeId">Commune</Label>
          <Select
            name="communeId"
            items={communeItems}
            defaultValue={defaultValues?.communeId ? String(defaultValues.communeId) : undefined}
            disabled={isPending}
          >
            <SelectTrigger className="w-full" id="communeId">
              <SelectValue placeholder="Sélectionner une commune" />
            </SelectTrigger>
            <SelectContent>
              {communeItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quartier">Quartier</Label>
          <Input id="quartier" name="quartier" defaultValue={defaultValues?.quartier ?? ""} maxLength={150} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ville">Ville</Label>
          <Input id="ville" name="ville" placeholder="Abidjan" defaultValue={defaultValues?.ville ?? ""} maxLength={100} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">Région</Label>
          <Input id="region" name="region" placeholder="Abidjan" defaultValue={defaultValues?.region ?? ""} maxLength={100} disabled={isPending} />
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

export function SitesManager({ sites, communes }: { sites: SiteRow[]; communes: Array<{ id: number; nom: string }> }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Site créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Site mis à jour.");
    router.refresh();
  }, [router]);

  const editing = sites.find((s) => s.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouveau site</Button>} />
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouveau site</DialogTitle>
              <DialogDescription>Site d&apos;archivage physique proposé en première étape de la Collecte.</DialogDescription>
            </DialogHeader>
            <SiteForm action={createSite} communes={communes} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Commune</TableHead>
              <TableHead>Dossiers</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun site. Créez-en un pour qu&apos;il soit proposé dans la Collecte.
                </TableCell>
              </TableRow>
            ) : (
              sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.nom}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.typeSite ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.commune?.nom ?? "—"}</TableCell>
                  <TableCell>{s._count.dossiers}</TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "default" : "secondary"}>{s.isActive ? "Actif" : "Inactif"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(s.id)}>
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
            <DialogTitle>Modifier le site</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code s&apos;il est déjà utilisé par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <SiteForm action={updateSite.bind(null, editing.id)} communes={communes} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
