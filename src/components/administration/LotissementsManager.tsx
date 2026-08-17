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
import { createLotissement, updateLotissement, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface LotissementRow {
  id: number;
  communeId: number;
  code: string;
  nom: string;
  description: string | null;
  isActive: boolean;
  commune: { id: number; nom: string };
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

function LotissementForm({
  action,
  communes,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  communes: Array<{ id: number; nom: string }>;
  defaultValues?: Partial<LotissementRow>;
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
      <div className="space-y-2">
        <Label htmlFor="communeId">Commune</Label>
        <Select name="communeId" items={communeItems} defaultValue={defaultValues?.communeId ? String(defaultValues.communeId) : undefined} disabled={isPending}>
          <SelectTrigger className="w-full" id="communeId">
            <SelectValue placeholder="Choisir une commune" />
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
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" defaultValue={defaultValues?.code} maxLength={20} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nom">Nom</Label>
        <Input id="nom" name="nom" defaultValue={defaultValues?.nom} maxLength={150} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optionnel)</Label>
        <Textarea id="description" name="description" defaultValue={defaultValues?.description ?? ""} rows={2} disabled={isPending} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="isActive" name="isActive" defaultChecked={defaultValues?.isActive ?? true} disabled={isPending} />
        <Label htmlFor="isActive" className="font-normal">
          Actif (proposé dans la Collecte)
        </Label>
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

export function LotissementsManager({
  lotissements,
  communes,
}: {
  lotissements: LotissementRow[];
  communes: Array<{ id: number; nom: string }>;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Lotissement créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Lotissement mis à jour.");
    router.refresh();
  }, [router]);

  const editing = lotissements.find((l) => l.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={communes.length === 0}><Plus className="mr-1 h-4 w-4" />Nouveau lotissement</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau lotissement</DialogTitle>
              <DialogDescription>Rattaché à une commune existante (§40).</DialogDescription>
            </DialogHeader>
            <LotissementForm action={createLotissement} communes={communes} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>
      {communes.length === 0 ? (
        <Alert>
          <AlertDescription>Créez d&apos;abord au moins une commune avant d&apos;ajouter un lotissement.</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Commune</TableHead>
              <TableHead>Dossiers</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotissements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun lotissement.
                </TableCell>
              </TableRow>
            ) : (
              lotissements.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.code}</TableCell>
                  <TableCell className="font-medium">{l.nom}</TableCell>
                  <TableCell>{l.commune.nom}</TableCell>
                  <TableCell>{l._count.dossiers}</TableCell>
                  <TableCell>
                    <Badge variant={l.isActive ? "default" : "secondary"}>{l.isActive ? "Actif" : "Inactif"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(l.id)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le lotissement</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code s&apos;il est déjà utilisé par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <LotissementForm action={updateLotissement.bind(null, editing.id)} communes={communes} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
