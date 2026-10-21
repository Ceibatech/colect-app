"use client";

import { useActionState, useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardSignature, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  approveReceptionByCeibac,
  approveReceptionByMinistry,
  authorizeTransferLot,
  recordTransferMovement,
  submitTransferLot,
  type TransferActionState,
} from "@/lib/services/transfer-actions";
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

export function SubmitTransferButton({ lotId }: { lotId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await submitTransferLot(lotId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Lot soumis.");
      router.refresh();
    });
  }

  return <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Soumettre au ministère</Button>;
}

export function AuthorizeTransferButton({ lotId }: { lotId: number }) {
  const action = useCallback(
    (previous: TransferActionState, formData: FormData) => authorizeTransferLot(lotId, previous, formData),
    [lotId],
  );
  return (
    <SignatureApprovalDialog
      title="Visa ministériel de sortie"
      description="Cette signature autorise la sortie du lot et rend disponible le bordereau contractuel partagé entre le ministère et CEIBAC."
      triggerLabel="Signer l'autorisation"
      submitLabel="Signer et autoriser la sortie"
      signatureLabel="Responsable ministère"
      action={action}
    />
  );
}

export function ReceptionApprovalDialog({ movementId, stage }: { movementId: number; stage: "CEIBAC" | "MINISTERE" }) {
  const action = useCallback(
    (previous: TransferActionState, formData: FormData) => stage === "CEIBAC"
      ? approveReceptionByCeibac(movementId, previous, formData)
      : approveReceptionByMinistry(movementId, previous, formData),
    [movementId, stage],
  );
  const ceibac = stage === "CEIBAC";
  return (
    <SignatureApprovalDialog
      title={ceibac ? "Contrôle du constat par CEIBAC" : "Contre-signature du ministère"}
      description={ceibac
        ? "Le validateur CEIBAC confirme le constat d'arrivée avant sa transmission au ministère."
        : "Le responsable du ministère clôt la réception. Cette signature déclenche l'entrée des dossiers dans le stock du site B."}
      triggerLabel={ceibac ? "Viser pour CEIBAC" : "Valider la réception"}
      submitLabel={ceibac ? "Signer et transmettre" : "Signer et mettre à jour le stock"}
      signatureLabel={ceibac ? "Validateur CEIBAC" : "Responsable ministère"}
      action={action}
      variant={ceibac ? "outline" : "default"}
    />
  );
}

function SignatureApprovalDialog({
  title,
  description,
  triggerLabel,
  submitLabel,
  signatureLabel,
  action,
  variant = "default",
}: {
  title: string;
  description: string;
  triggerLabel: string;
  submitLabel: string;
  signatureLabel: string;
  action: (previous: TransferActionState, formData: FormData) => Promise<TransferActionState>;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const wrappedAction = useCallback(async (previous: TransferActionState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.success) {
      toast.success(result.message ?? "Signature enregistrée.");
      setOpen(false);
      setFormVersion((value) => value + 1);
      router.refresh();
    }
    return result;
  }, [action, router]);
  const [state, formAction, pending] = useActionState(wrappedAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} />}><ShieldCheck /> {triggerLabel}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <form key={formVersion} action={formAction} className="space-y-5">
          {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`${signatureLabel}-name`}>Nom complet</Label><Input id={`${signatureLabel}-name`} name="signatoryName" required maxLength={120} disabled={pending} /></div>
            <div className="space-y-2"><Label htmlFor={`${signatureLabel}-title`}>Fonction habilitée</Label><Input id={`${signatureLabel}-title`} name="signatoryTitle" required maxLength={120} disabled={pending} /></div>
          </div>
          <SignaturePad name="signature" label={signatureLabel} disabled={pending} />
          <DialogFooter><Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Check />} {submitLabel}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const isReception = type === "RECEPTION";
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
  const siteSignatureTitle = `Visa du site A · ${sourceLabel}`;
  const siteSignatureHelp = type === "SORTIE"
    ? "Le responsable du site d'origine confirme la remise physique des dossiers."
    : "Le responsable du site d'origine confirme le retour des dossiers dans son stock.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={type === "SORTIE" ? "default" : "outline"} />} disabled={items.length === 0}>
        <ClipboardSignature /> {isReception ? "Constat de déchargement" : label}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isReception ? "Constat d'arrivée et de déchargement" : label}</DialogTitle>
          <DialogDescription>
            {isReception
              ? `L'agent CEIBAC au site B (${destinationLabel}) décrit l'état du chargement et signe le constat. Le stock restera en transit jusqu'aux visas CEIBAC puis ministère.`
              : "Sélectionnez les dossiers réellement concernés. Le mouvement et les deux signatures seront enregistrés dans une seule opération."}
          </DialogDescription>
        </DialogHeader>
        <form key={formVersion} action={formAction} className="space-y-5">
          <input type="hidden" name="type" value={type} />
          {selected.map((id) => <input key={id} type="hidden" name="itemIds" value={id} />)}
          {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label>Dossiers du bordereau</Label><Button type="button" size="sm" variant="ghost" onClick={() => setSelected(allSelected ? [] : items.map((item) => item.id))}>{allSelected ? "Tout retirer" : "Tout sélectionner"}</Button></div>
            <div className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {items.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50">
                  <Checkbox checked={selected.includes(item.id)} onCheckedChange={(value) => toggle(item.id, value === true)} disabled={pending} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.cartonCode}</span><span className="block truncate text-xs text-muted-foreground">{item.cartonLabel ?? "Sans libellé de contenant"} · {item.dossierCount} dossier{item.dossierCount > 1 ? "s" : ""}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`${type}-occurredAt`}>Date et heure</Label><Input id={`${type}-occurredAt`} name="occurredAt" type="datetime-local" defaultValue={localDateTimeValue()} required disabled={pending} /></div>
            {isReception ? (
              <div className="space-y-2"><Label htmlFor="conditionStatus">État à l&apos;arrivée</Label><select id="conditionStatus" name="conditionStatus" required disabled={pending} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Sélectionner</option><option value="CONFORME">Conforme</option><option value="AVEC_RESERVES">Conforme avec réserves</option><option value="NON_CONFORME">Non conforme</option></select></div>
            ) : null}
            <div className={isReception ? "space-y-2 sm:col-span-2" : "space-y-2"}><Label htmlFor={`${type}-observations`}>{isReception ? "État des lieux et observations" : "Observations"}</Label><Textarea id={`${type}-observations`} name="observations" rows={3} maxLength={2000} disabled={pending} /></div>
          </div>

          <div className={`grid gap-5 border-t pt-5 ${isReception ? "" : "lg:grid-cols-2"}`}>
            {!isReception ? (
              <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div><h3 className="font-semibold">{siteSignatureTitle}</h3><p className="text-xs text-muted-foreground">{siteSignatureHelp}</p></div>
                <div className="space-y-2"><Label htmlFor={`${type}-ministryName`}>Nom complet</Label><Input id={`${type}-ministryName`} name="ministryName" required maxLength={120} disabled={pending} /></div>
                <div className="space-y-2"><Label htmlFor={`${type}-ministryTitle`}>Fonction habilitée</Label><Input id={`${type}-ministryTitle`} name="ministryTitle" required maxLength={120} disabled={pending} /></div>
                <SignaturePad name="ministrySignature" label="Site A" disabled={pending} />
              </section>
            ) : null}
            <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div><h3 className="font-semibold">{isReception ? "Signature de l'agent CEIBAC au déchargement" : "Visa du gestionnaire CEIBAC"}</h3><p className="text-xs text-muted-foreground">L&apos;agent confirme la prise en charge, la remise ou le constat physique du chargement.</p></div>
              <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`${type}-ceibacName`}>Nom complet</Label><Input id={`${type}-ceibacName`} name="ceibacName" required maxLength={120} disabled={pending} /></div><div className="space-y-2"><Label htmlFor={`${type}-ceibacTitle`}>Fonction habilitée</Label><Input id={`${type}-ceibacTitle`} name="ceibacTitle" required maxLength={120} disabled={pending} /></div></div>
              <SignaturePad name="ceibacSignature" label="CEIBAC" disabled={pending} />
            </section>
          </div>

          <DialogFooter><Button type="submit" disabled={pending || selected.length === 0}>{pending ? <Loader2 className="animate-spin" /> : <ClipboardSignature />} {isReception ? "Signer et soumettre le constat" : "Signer et enregistrer le bordereau"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
