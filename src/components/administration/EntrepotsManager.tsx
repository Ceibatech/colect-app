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
  site: { id: number; nom: string };
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

// Non contraignant — la fiche métier donne "Principal / secondaire" comme
// exemple, pas comme liste fermée.
const TYPE_ENTREPOT_SUGGESTIONS = ["Principal", "Secondaire"];

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
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entrepots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
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
