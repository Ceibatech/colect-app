"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  sendPendingUsersAccessEmails,
  sendUserAccessEmail,
  type ActionResult,
} from "@/lib/services/user-admin-service";

const initialState: ActionResult = {};

export function SendUserAccessButton({ userId, email, disabled }: { userId: number; email: string; disabled?: boolean }) {
  const boundAction = sendUserAccessEmail.bind(null, userId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (state.success && state.message) toast.success(state.message);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        disabled={disabled || isPending}
        aria-label={`Envoyer un lien d'accès à ${email}`}
        title="Envoyer un lien d'accès sécurisé"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
      </Button>
    </form>
  );
}

export function SendPendingUsersAccessDialog({ pendingCount }: { pendingCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={pendingCount === 0}>
            <Send className="mr-2 h-4 w-4" />
            Envoyer les accès en attente
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer les accès en attente</DialogTitle>
          <DialogDescription>
            {pendingCount} compte{pendingCount > 1 ? "s actifs n'ont" : " actif n'a"} encore jamais été utilisé. Chaque personne recevra un lien personnel valable 60 minutes pour définir son mot de passe. Jusqu&apos;à 10 invitations sont traitées par envoi.
          </DialogDescription>
        </DialogHeader>
        {open ? <PendingUsersAccessForm onClose={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PendingUsersAccessForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(sendPendingUsersAccessEmails, initialState);

  if (state.success) {
    return (
      <div className="space-y-4" aria-live="polite">
        <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">{state.message}</p>
            {state.warning ? <p className="mt-1 text-amber-800">{state.warning}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="rounded-md border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
        Aucun mot de passe n&apos;est transmis par e-mail. Un nouvel envoi invalide automatiquement le lien précédent.
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>Annuler</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Lancer l&apos;envoi
        </Button>
      </DialogFooter>
    </form>
  );
}
