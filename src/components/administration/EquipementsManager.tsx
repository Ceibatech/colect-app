"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createEquipement, updateEquipement, deleteEquipement, type ActionResult } from "@/lib/services/referentiels-admin-service";

export interface EquipementRow {
  id: number;
  entrepotId: number;
  type: string;
  reference: string | null;
  marque: string | null;
  quantite: number | null;
  etat: "BON_ETAT" | "DEGRADE" | null;
  dateAcquisition: string | null; // ISO (YYYY-MM-DD), déjà sérialisé par la page
  dateDernierControle: string | null;
  dateProchaineMaintenance: string | null;
  observation: string | null;
  entrepot: { id: number; nom: string; site: { id: number; nom: string } };
}

const initialState: ActionResult = {};

// Exemples fournis par le métier — suggestions non contraignantes, "Autres
// équipements" indique une liste ouverte.
const TYPE_EQUIPEMENT_SUGGESTIONS = [
  "Rayonnages", "Armoires", "Scanner", "Climatisation", "Déshumidificateur",
  "Extincteurs", "Détecteurs de fumée", "Caméras", "Système d'alarme",
  "Groupe électrogène", "Onduleurs", "Éclairage de secours",
];

function EquipementForm({
  action,
  entrepots,
  defaultValues,
  onSuccess,
}: {
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  entrepots: Array<{ id: number; nom: string; site: { nom: string } }>;
  defaultValues?: Partial<EquipementRow>;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const entrepotItems = entrepots.map((e) => ({ label: `${e.nom} — ${e.site.nom}`, value: String(e.id) }));

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
        <Label htmlFor="entrepotId">Entrepôt</Label>
        <Select
          name="entrepotId"
          items={entrepotItems}
          defaultValue={defaultValues?.entrepotId ? String(defaultValues.entrepotId) : undefined}
          disabled={isPending}
        >
          <SelectTrigger className="w-full" id="entrepotId">
            <SelectValue placeholder="Choisir un entrepôt" />
          </SelectTrigger>
          <SelectContent>
            {entrepotItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <Input
            id="type"
            name="type"
            list="type-equipement-datalist"
            placeholder="Rayonnages"
            defaultValue={defaultValues?.type}
            maxLength={100}
            required
            disabled={isPending}
          />
          <datalist id="type-equipement-datalist">
            {TYPE_EQUIPEMENT_SUGGESTIONS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <div className="space-y-2">
          <Label htmlFor="reference">Référence</Label>
          <Input id="reference" name="reference" defaultValue={defaultValues?.reference ?? ""} maxLength={100} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="marque">Marque</Label>
          <Input id="marque" name="marque" defaultValue={defaultValues?.marque ?? ""} maxLength={100} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantite">Quantité</Label>
          <Input id="quantite" name="quantite" type="number" min={0} defaultValue={defaultValues?.quantite ?? 1} disabled={isPending} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>État</Label>
        <RadioGroup name="etat" defaultValue={defaultValues?.etat ?? ""} className="flex flex-wrap gap-4" disabled={isPending}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="" id="etat-non-renseigne" />
            <Label htmlFor="etat-non-renseigne" className="font-normal">Non renseigné</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="BON_ETAT" id="etat-bon" />
            <Label htmlFor="etat-bon" className="font-normal">Bon état</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="DEGRADE" id="etat-degrade" />
            <Label htmlFor="etat-degrade" className="font-normal">Dégradé</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="dateAcquisition">Date d&apos;acquisition</Label>
          <Input id="dateAcquisition" name="dateAcquisition" type="date" defaultValue={defaultValues?.dateAcquisition ?? ""} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateDernierControle">Date dernier contrôle</Label>
          <Input id="dateDernierControle" name="dateDernierControle" type="date" defaultValue={defaultValues?.dateDernierControle ?? ""} disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dateProchaineMaintenance">Date prochaine maintenance</Label>
          <Input id="dateProchaineMaintenance" name="dateProchaineMaintenance" type="date" defaultValue={defaultValues?.dateProchaineMaintenance ?? ""} disabled={isPending} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="observation">Observation</Label>
        <Textarea id="observation" name="observation" rows={2} defaultValue={defaultValues?.observation ?? ""} disabled={isPending} />
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

const ETAT_LABELS: Record<string, string> = { BON_ETAT: "Bon état", DEGRADE: "Dégradé" };

export function EquipementsManager({
  equipements,
  entrepots,
}: {
  equipements: EquipementRow[];
  entrepots: Array<{ id: number; nom: string; site: { nom: string } }>;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Équipement créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Équipement mis à jour.");
    router.refresh();
  }, [router]);

  const editing = equipements.find((e) => e.id === editId);
  const deleting = equipements.find((e) => e.id === deleteId);

  function handleDelete() {
    if (deleteId === null) return;
    const id = deleteId;
    startDeleteTransition(async () => {
      const result = await deleteEquipement(id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Équipement supprimé.");
        router.refresh();
      }
      setDeleteId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={entrepots.length === 0}><Plus className="mr-1 h-4 w-4" />Nouvel équipement</Button>} />
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvel équipement</DialogTitle>
              <DialogDescription>Rattaché à un entrepôt existant.</DialogDescription>
            </DialogHeader>
            <EquipementForm action={createEquipement} entrepots={entrepots} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>
      {entrepots.length === 0 ? (
        <Alert>
          <AlertDescription>Créez d&apos;abord au moins un entrepôt avant d&apos;ajouter un équipement.</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Marque</TableHead>
              <TableHead>Quantité</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Entrepôt</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {equipements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Aucun équipement.
                </TableCell>
              </TableRow>
            ) : (
              equipements.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.type}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.reference ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.marque ?? "—"}</TableCell>
                  <TableCell>{e.quantite ?? "—"}</TableCell>
                  <TableCell>
                    {e.etat ? (
                      <Badge variant={e.etat === "DEGRADE" ? "destructive" : "secondary"}>{ETAT_LABELS[e.etat]}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.entrepot.nom} — {e.entrepot.site.nom}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(e.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Supprimer" onClick={() => setDeleteId(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
            <DialogTitle>Modifier l&apos;équipement</DialogTitle>
            <DialogDescription>Mettre à jour l&apos;inventaire (état, dates de contrôle...).</DialogDescription>
          </DialogHeader>
          {editing ? (
            <EquipementForm action={updateEquipement.bind(null, editing.id)} entrepots={entrepots} defaultValues={editing} onSuccess={onSuccessEdit} />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet équipement ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.type}"${deleting.reference ? ` (${deleting.reference})` : ""} sera définitivement retiré de l'inventaire. ` : ""}
              Cette action est irréversible — contrairement aux autres référentiels, un équipement n&apos;étant
              rattaché à aucun dossier, il peut être supprimé physiquement (matériel remplacé ou mis au rebut).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
