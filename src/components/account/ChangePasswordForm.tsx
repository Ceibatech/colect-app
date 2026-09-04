"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { changePasswordAction, type ChangePasswordFormState } from "@/lib/services/auth-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

const initialState: ChangePasswordFormState = {};

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      toast.success("Mot de passe mis à jour.");
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {state.error ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <PasswordField id="currentPassword" name="currentPassword" label="Mot de passe actuel" autoComplete="current-password" disabled={isPending} />
      <PasswordField id="newPassword" name="newPassword" label="Nouveau mot de passe" autoComplete="new-password" disabled={isPending} minLength={8} hint="Au moins 8 caractères." />
      <PasswordField id="confirmPassword" name="confirmPassword" label="Confirmer le nouveau mot de passe" autoComplete="new-password" disabled={isPending} minLength={8} />

      <Button type="submit" size="lg" className="h-10 shadow-sm" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
        Mettre à jour le mot de passe
      </Button>
    </form>
  );
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  disabled,
  minLength,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  disabled: boolean;
  minLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <div className="relative">
        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          name={name}
          type="password"
          autoComplete={autoComplete}
          minLength={minLength}
          className="h-10 pl-9"
          required
          disabled={disabled}
        />
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}