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
import { createTypePiece, updateTypePiece, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface TypePieceRow {
  id: number;
  code: string;
  libelle: string;
  description: string | null;
  isActive: boolean;
  _count: { dossiers: number };
}

const initialState: ActionResult = {};

function TypePieceForm({
  action,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: Partial<TypePieceRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

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

/**
 * Types de pièces du dossier (Phase 18+) — même schéma d'administration que
 * NaturesManager.tsx : liste fermée mais extensible, alimentée soit ici en
 * amont, soit à la volée depuis la Collecte (StepDossier.tsx, résolu par
 * find-or-create dans dossier-service.ts).
 */
export function TypesPieceManager({ typesPiece }: { typesPiece: TypePieceRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Type de pièce créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Type de pièce mis à jour.");
    router.refresh();
  }, [router]);

  const editing = typesPiece.find((t) => t.id === editId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouveau type</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau type de pièce</DialogTitle>
              <DialogDescription>Ex. CNI, Carte résident, Carte consulaire, Extrait topo, Acte de naissance...</DialogDescription>
            </DialogHeader>
            <TypePieceForm action={createTypePiece} onSuccess={onSuccessCreate} />
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
            {typesPiece.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun type de pièce. Ajoutez le premier avec &laquo;&nbsp;Nouveau type&nbsp;&raquo;.
                </TableCell>
              </TableRow>
            ) : (
              typesPiece.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell className="font-medium">{t.libelle}</TableCell>
                  <TableCell>{t._count.dossiers}</TableCell>
                  <TableCell>
                    <Badge variant={t.isActive ? "default" : "secondary"}>{t.isActive ? "Actif" : "Inactif"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(t.id)}>
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
            <DialogTitle>Modifier le type de pièce</DialogTitle>
            <DialogDescription>Désactiver plutôt que renommer le code si déjà utilisé par des dossiers.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <TypePieceForm action={updateTypePiece.bind(null, editing.id)} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
