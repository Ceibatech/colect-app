"use client";

import { useKeepForm } from "@/hooks/use-keep-form";
import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createIndexingField, updateIndexingField, type IndexingFieldActionResult } from "@/lib/services/indexing-config-service";

interface FieldRow {
  id: number;
  key: string;
  label: string;
  aliases: string[];
  dataType: "TEXT" | "DATE" | "NUMBER" | "IDENTIFIER";
  isRequired: boolean;
  isSearchable: boolean;
  isActive: boolean;
  sortOrder: number;
  _count: { values: number };
}

const initialState: IndexingFieldActionResult = {};
const DATA_TYPES = [
  { value: "TEXT", label: "Texte" },
  { value: "IDENTIFIER", label: "Identifiant / référence" },
  { value: "DATE", label: "Date" },
  { value: "NUMBER", label: "Nombre" },
] as const;

function FieldForm({
  action,
  field,
  onSuccess,
}: {
  action: (previous: IndexingFieldActionResult, formData: FormData) => Promise<IndexingFieldActionResult>;
  field?: FieldRow;
  onSuccess: () => void;
}) {
  const [state, formAction, isPendingAction] = useActionState(action, initialState);
  const { onSubmit: keepFormAction, pending: isPendingSubmit } = useKeepForm(formAction);
  const isPending = isPendingAction || isPendingSubmit;
  useEffect(() => { if (state.success) onSuccess(); }, [state.success, onSuccess]);

  return (
    <form onSubmit={keepFormAction} className="space-y-4">
      {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="field-label">Libellé métier</Label>
          <Input id="field-label" name="label" defaultValue={field?.label} maxLength={120} required disabled={isPending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="field-key">Clé technique</Label>
          <Input id="field-key" name="key" defaultValue={field?.key} placeholder="numero_dossier" maxLength={80} required disabled={isPending || Boolean(field?._count.values)} />
          {field?._count.values ? <input type="hidden" name="key" value={field.key} /> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="field-type">Type de valeur</Label>
          <Select name="dataType" items={DATA_TYPES} defaultValue={field?.dataType ?? "TEXT"} disabled={isPending}>
            <SelectTrigger id="field-type" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{DATA_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="field-order">Ordre d&apos;affichage</Label>
          <Input id="field-order" name="sortOrder" type="number" min={0} max={10000} defaultValue={field?.sortOrder ?? 0} required disabled={isPending} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="field-aliases">Libellés reconnus dans les documents</Label>
          <Textarea id="field-aliases" name="aliases" rows={3} maxLength={1000} defaultValue={field?.aliases.join(", ")} placeholder="N° de dossier, référence dossier, réf." disabled={isPending} />
          <p className="text-xs text-muted-foreground">Séparez les variantes par une virgule. Les accents et la casse sont tolérés.</p>
        </div>
      </div>
      <div className="grid gap-3 rounded-md border bg-muted/25 p-3 sm:grid-cols-3">
        <CheckOption name="isSearchable" label="Utilisé en recherche" defaultChecked={field?.isSearchable ?? true} disabled={isPending} />
        <CheckOption name="isRequired" label="Obligatoire au contrôle" defaultChecked={field?.isRequired ?? false} disabled={isPending} />
        <CheckOption name="isActive" label="Champ actif" defaultChecked={field?.isActive ?? true} disabled={isPending} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : null}Enregistrer</Button>
      </DialogFooter>
    </form>
  );
}

function CheckOption({ name, label, defaultChecked, disabled }: { name: string; label: string; defaultChecked: boolean; disabled: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox name={name} defaultChecked={defaultChecked} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

export function IndexingFieldsManager({ fields }: { fields: FieldRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const editing = fields.find((field) => field.id === editId);
  const created = useCallback(() => {
    setCreateOpen(false);
    toast.success("Champ d'indexation créé.");
    router.refresh();
  }, [router]);
  const updated = useCallback(() => {
    setEditId(null);
    toast.success("Champ d'indexation mis à jour.");
    router.refresh();
  }, [router]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus />Nouveau champ</Button>} />
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>Nouveau champ de recherche</DialogTitle><DialogDescription>Le moteur cherchera ce libellé et ses variantes dans le texte extrait des scans.</DialogDescription></DialogHeader>
            <FieldForm action={createIndexingField} onSuccess={created} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table className="min-w-[900px]">
          <TableHeader><TableRow><TableHead>Champ</TableHead><TableHead>Libellés reconnus</TableHead><TableHead>Type</TableHead><TableHead>Valeurs</TableHead><TableHead>Règles</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {fields.map((field) => (
              <TableRow key={field.id}>
                <TableCell><p className="font-medium">{field.label}</p><p className="font-mono text-xs text-muted-foreground">{field.key}</p></TableCell>
                <TableCell className="max-w-80 whitespace-normal text-sm text-muted-foreground">{field.aliases.join(", ") || "Libellé principal uniquement"}</TableCell>
                <TableCell>{DATA_TYPES.find((type) => type.value === field.dataType)?.label}</TableCell>
                <TableCell className="tabular-nums">{field._count.values}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1"><Badge variant={field.isActive ? "default" : "secondary"}>{field.isActive ? "Actif" : "Inactif"}</Badge>{field.isRequired ? <Badge variant="outline">Obligatoire</Badge> : null}{field.isSearchable ? <Badge variant="outline">Recherche</Badge> : null}</div></TableCell>
                <TableCell className="text-right"><Button size="icon-sm" variant="ghost" title="Modifier" aria-label={`Modifier ${field.label}`} onClick={() => setEditId(field.id)}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Modifier le champ</DialogTitle><DialogDescription>Les prochaines analyses utiliseront immédiatement cette configuration.</DialogDescription></DialogHeader>
          {editing ? <FieldForm action={updateIndexingField.bind(null, editing.id)} field={editing} onSuccess={updated} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
