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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createCommune, updateCommune, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface CommuneRow {
  id: number;
  code: string;
  nom: string;
  description: string | null;
  isActive: boolean;
  _count: { lotissements: number; dossiers: number };
}

const initialState: ActionResult = {};

function CommuneForm({
  action,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<CommuneRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // `onSuccess` doit être mémoïsé (useCallback) côté appelant — sinon une
  // identité changeant à chaque rendu (ex. re-rendu déclenché par
  // router.refresh() à l'intérieur même de ce callback) redéclencherait cet
  // effet en boucle et doublerait le toast.
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
          Active (proposée dans la Collecte)
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

export function CommunesManager({ communes }: { communes: CommuneRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  // Mémoïsés : une identité stable évite que le `useEffect` de CommuneForm
  // (déclenché sur `state.success`) ne se redéclenche à cause du re-rendu
  // que ce callback provoque lui-même via `router.refresh()`.
  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Commune créée.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Commune mise à jour.");
    router.refresh();
  }, [router]);

  const editing = communes.find((c) => c.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouvelle commune</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle commune</DialogTitle>
              <DialogDescription>Référentiel utilisé par la Collecte et les dashboards (§40/§48).</DialogDescription>
            </DialogHeader>
            <CommuneForm action={createCommune} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Lotissements</TableHead>
              <TableHead>Dossiers</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {communes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Aucune commune. Ajoutez la première avec &laquo;&nbsp;Nouvelle commune&nbsp;&raquo;.
                </TableCell>
              </TableRow>
            ) : (
              communes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.nom}</TableCell>
                  <TableCell>{c._count.lotissements}</TableCell>
                  <TableCell>{c._count.dossiers}</TableCell>
                  <TableCell>
                    <Badge variant={c.isActive ? "default" : "secondary"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(c.id)}>
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
            <DialogTitle>Modifier la commune</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code si la commune est déjà utilisée par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <CommuneForm action={updateCommune.bind(null, editing.id)} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
