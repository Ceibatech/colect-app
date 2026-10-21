"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authorizeTransferLot, recordTransferMovement, type TransferActionState } from "@/lib/services/transfer-actions";
import { getTransferMovementLabel, type TransferMovementTypeCode } from "@/lib/utils/transfer-stock";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "@/components/transferts/SignaturePad";

const initialState: TransferActionState = {};

export interface TransferMovementItemOption {
  id: number;
  cartonCode: string;
  cartonLabel: string | null;
  dossierCount: number;
}

function localDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function AuthorizeTransferButton({ lotId }: { lotId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function authorize() {
    startTransition(async () => {
      const result = await authorizeTransferLot(lotId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Lot autorisé.");
      router.refresh();
    });
  }

  return (
    <Button onClick={authorize} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Check />}
      Valider le lot au départ
    </Button>
  );
}

export function TransferMovementDialog({
  lotId,
  type,
  items,
  sourceLabel,
  destinationLabel,
}: {
  lotId: number;
  type: TransferMovementTypeCode;
  items: TransferMovementItemOption[];
  sourceLabel: string;
  destinationLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const label = getTransferMovementLabel(type);
  const action = useCallback(async (previous: TransferActionState, formData: FormData) => {
    const result = await recordTransferMovement(lotId, previous, formData);
    if (result.success) {
      toast.success(result.message ?? "Mouvement enregistré.");
      setOpen(false);
      setSelected([]);
      setFormVersion((value) => value + 1);
      router.refresh();
    }
    return result;
  }, [lotId, router]);
  const [state, formAction, pending] = useActionState(action, initialState);

  function toggle(id: number, checked: boolean) {
    setSelected((current) => checked
      ? current.includes(id) ? current : [...current, id]
      : current.filter((itemId) => itemId !== id));
  }

  const allSelected = items.length > 0 && selected.length === items.length;
  const siteSignatureTitle = type === "RECEPTION"
    ? `Visa du site B · ${destinationLabel}`
    : `Visa du site A · ${sourceLabel}`;
  const siteSignatureHelp = type === "SORTIE"
    ? "Le responsable du site d'origine confirme la remise physique des dossiers."
    : type === "RECEPTION"
      ? "Le responsable du site de destination confirme l'entrée des dossiers dans son stock."
      : "Le responsable du site d'origine confirme le retour des dossiers dans son stock.";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={type === "SORTIE" ? "default" : "outline"} />} disabled={items.length === 0}>
        <ClipboardSignature /> {label}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Sélectionnez les dossiers réellement concernés. Le stock, le bordereau et les deux signatures seront enregistrés dans une seule opération.
          </DialogDescription>
        </DialogHeader>
        <form key={formVersion} action={formAction} className="space-y-5">
          <input type="hidden" name="type" value={type} />
          {selected.map((id) => <input key={id} type="hidden" name="itemIds" value={id} />)}
          {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Dossiers du bordereau</Label>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}>
                {allSelected ? "Tout retirer" : "Tout sélectionner"}
              </Button>
            </div>
            <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50">
                  <Checkbox checked={selected.includes(item.id)} onCheckedChange={(value) => toggle(item.id, value === true)} disabled={pending} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.cartonCode}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.cartonLabel ?? "Sans libellé de contenant"} · {item.dossierCount} dossier{item.dossierCount > 1 ? "s" : ""}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`${type}-occurredAt`}>Date et heure</Label><Input id={`${type}-occurredAt`} name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} required disabled={pending} /></div>
            <div className="space-y-2"><Label htmlFor={`${type}-observations`}>Observations</Label><Textarea id={`${type}-observations`} name="observations" rows={2} maxLength={2000} disabled={pending} /></div>
          </div>

          <div className="grid gap-5 border-t pt-5 lg:grid-cols-2">
            <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div><h3 className="font-semibold">{siteSignatureTitle}</h3><p className="text-xs text-muted-foreground">{siteSignatureHelp}</p></div>
              <div className="space-y-2"><Label htmlFor={`${type}-ministryName`}>Nom complet</Label><Input id={`${type}-ministryName`} name="ministryName" required maxLength={120} disabled={pending} /></div>
              <div className="space-y-2"><Label htmlFor={`${type}-ministryTitle`}>Fonction habilitée</Label><Input id={`${type}-ministryTitle`} name="ministryTitle" required maxLength={120} disabled={pending} /></div>
              <SignaturePad name="ministrySignature" label={type === "RECEPTION" ? "Site B" : "Site A"} disabled={pending} />
            </section>
            <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div><h3 className="font-semibold">Visa du gestionnaire CEIBAC</h3><p className="text-xs text-muted-foreground">L&apos;agent confirme la prise en charge ou la remise physique pendant le mouvement.</p></div>
              <div className="space-y-2"><Label htmlFor={`${type}-ceibacName`}>Nom complet</Label><Input id={`${type}-ceibacName`} name="ceibacName" required maxLength={120} disabled={pending} /></div>
              <div className="space-y-2"><Label htmlFor={`${type}-ceibacTitle`}>Fonction habilitée</Label><Input id={`${type}-ceibacTitle`} name="ceibacTitle" required maxLength={120} disabled={pending} /></div>
              <SignaturePad name="ceibacSignature" label="CEIBAC" disabled={pending} />
            </section>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || selected.length === 0}>
              {pending ? <Loader2 className="animate-spin" /> : <ClipboardSignature />}
              Signer et enregistrer le bordereau
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
