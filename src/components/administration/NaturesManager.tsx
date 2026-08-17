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
import { createNature, updateNature, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface NatureRow {
  id: number;
  code: string;
  libelle: string;
  description: string | null;
  isActive: boolean;
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

function NatureForm({
  action,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<NatureRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

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
        <Label htmlFor="code">Code</Label>
        <Input id="code" name="code" defaultValue={defaultValues?.code} maxLength={20} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="libelle">Libellé</Label>
        <Input id="libelle" name="libelle" defaultValue={defaultValues?.libelle} maxLength={150} required disabled={isPending} />
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

export function NaturesManager({ natures }: { natures: NatureRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Nature de dossier créée.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Nature de dossier mise à jour.");
    router.refresh();
  }, [router]);

  const editing = natures.find((n) => n.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouvelle nature</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvelle nature de dossier</DialogTitle>
              <DialogDescription>Ex. Titre foncier, Attestation villageoise, Lettre d&apos;attribution...</DialogDescription>
            </DialogHeader>
            <NatureForm action={createNature} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Dossiers</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {natures.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Aucune nature de dossier. Ajoutez la première avec &laquo;&nbsp;Nouvelle nature&nbsp;&raquo;.
                </TableCell>
              </TableRow>
            ) : (
              natures.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">{n.code}</TableCell>
                  <TableCell className="font-medium">{n.libelle}</TableCell>
                  <TableCell>{n._count.dossiers}</TableCell>
                  <TableCell>
                    <Badge variant={n.isActive ? "default" : "secondary"}>{n.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(n.id)}>
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
            <DialogTitle>Modifier la nature de dossier</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code si déjà utilisée par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <NatureForm action={updateNature.bind(null, editing.id)} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
