"use client";

import { useKeepForm } from "@/hooks/use-keep-form";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteUser, type ActionResult } from "@/lib/services/user-admin-service";
import { isDeletionConfirmed } from "@/lib/utils/user-deletion";

const initialState: ActionResult = {};

export function UserDeleteControl({ userId, name, email }: { userId: number; name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const boundAction = deleteUser.bind(null, userId);
  const [state, formAction, isPendingAction] = useActionState(boundAction, initialState);
  const { onSubmit: keepFormAction, pending: isPendingSubmit } = useKeepForm(formAction);
  const isPending = isPendingAction || isPendingSubmit;

  // La ligne disparaît au rafraîchissement : le composant est démonté, la boîte n'a pas à être refermée.
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.message ?? "Compte supprimé.");
    router.refresh();
  }, [state.success, state.message, router]);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTyped(""); }}>
      <DialogTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label={`Supprimer le compte ${email}`} title="Supprimer le compte" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={keepFormAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Supprimer le compte</DialogTitle>
            <DialogDescription>
              Le compte de {name} ({email}) sera supprimé définitivement. Cette action est irréversible. Si ce compte a déjà travaillé dans l&apos;application (dossiers, validations, transferts), la suppression sera refusée : désactivez-le plutôt pour conserver l&apos;historique.
            </DialogDescription>
          </DialogHeader>
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor={`confirm-delete-${userId}`}>Pour confirmer, saisissez l&apos;e-mail du compte</Label>
            <Input
              id={`confirm-delete-${userId}`}
              name="confirmEmail"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              placeholder={email}
              disabled={isPending}
            />
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={isPending || !isDeletionConfirmed(typed, email)}>
              {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
