"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { requestPasswordResetAction, type RequestPasswordResetFormState } from "@/lib/services/auth-service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: RequestPasswordResetFormState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  if (state.success) {
    return (
      <div className="space-y-5" aria-live="polite">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Consultez votre messagerie</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Si un compte actif correspond à cette adresse, un lien sécurisé vient d&apos;être envoyé. Il reste valable pendant 60 minutes.
          </p>
        </div>
        <Link href="/login" className={cn(buttonVariants(), "h-11 w-full sm:w-auto")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="recovery-email">E-mail professionnel</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={150}
            disabled={isPending}
            className="h-11 pl-10"
            placeholder="prenom.nom@ceiba-analytics.com"
          />
        </div>
      </div>
      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
        Envoyer le lien sécurisé
      </Button>
      <Link href="/login" className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Retour à la connexion
      </Link>
    </form>
  );
}
