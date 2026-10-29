"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/transferts/SignaturePad";
import { useSignataire } from "@/components/transferts/Signataire";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useKeepForm } from "@/hooks/use-keep-form";
import { deleteMySignature, saveMySignature, type SignatureState } from "@/lib/services/signature-service";

/** Dessiner et enregistrer sa signature, pour qu'elle soit apposée d'office sur les bordereaux. */
export function SignatureSettings() {
  const saved = useSignataire()?.signature ?? null;
  const [version, setVersion] = useState(0);
  const [state, formAction, saving] = useActionState(async (previous: SignatureState, formData: FormData) => {
    const result = await saveMySignature(previous, formData);
    if (result.success) { toast.success(result.message); setVersion((v) => v + 1); }
    return result;
  }, {});
  const { onSubmit, pending } = useKeepForm(formAction);
  const [deleting, startDelete] = useTransition();

  return (
    <div className="space-y-4">
      {saved ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Signature enregistrée</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- image en data URL */}
          <img src={saved} alt="Votre signature enregistrée" className="h-28 w-full max-w-md rounded-md border bg-white object-contain p-2" />
          <Button type="button" variant="ghost" size="sm" disabled={deleting} onClick={() => startDelete(async () => { const result = await deleteMySignature(); toast.success(result.message); })}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Supprimer
          </Button>
        </div>
      ) : null}
      <form key={version} onSubmit={onSubmit} className="space-y-3">
        {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
        <SignaturePad name="signature" label={saved ? "Remplacer ma signature" : "Dessinez votre signature"} useSaved={false} disabled={saving || pending} />
        <Button type="submit" disabled={saving || pending}>{saving || pending ? <Loader2 className="animate-spin" /> : <Check />} Enregistrer ma signature</Button>
      </form>
    </div>
  );
}
