"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { resetPasswordFromLinkAction, type ResetPasswordFromLinkFormState } from "@/lib/services/auth-service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: ResetPasswordFromLinkFormState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordFromLinkAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  if (state.success) {
    return (
      <div className="space-y-5" aria-live="polite">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Mot de passe mis à jour</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Votre lien a été consommé et ne peut plus être réutilisé. Vous pouvez maintenant vous connecter.
          </p>
        </div>
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full")}>
          Accéder à la connexion
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-5">
        <Alert variant="destructive">
          <AlertDescription>Ce lien de réinitialisation est incomplet ou invalide.</AlertDescription>
        </Alert>
        <Link href="/mot-de-passe-oublie" className={cn(buttonVariants(), "h-11 w-full")}>
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <PasswordInput
        id="new-password"
        name="newPassword"
        label="Nouveau mot de passe"
        visible={showPassword}
        disabled={isPending}
      />
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
        <Input
          id="confirm-password"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          disabled={isPending}
          className="h-11"
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(event) => setShowPassword(event.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        Afficher les mots de passe
      </label>
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
        Enregistrer le nouveau mot de passe
      </Button>
    </form>
  );
}

function PasswordInput({ id, name, label, visible, disabled }: { id: string; name: string; label: string; visible: boolean; disabled: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          required
          disabled={disabled}
          className="h-11 pr-10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Utilisez au moins 8 caractères et évitez un mot de passe déjà employé ailleurs.</p>
    </div>
  );
}
