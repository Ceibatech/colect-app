"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/lib/services/auth-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowRight, Loader2, LockKeyhole, Mail } from "lucide-react";

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium">
          E-mail
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="prenom.nom@mulcv-demo.local"
            className="h-10 pl-9"
            required
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-medium">
          Mot de passe
        </Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="h-10 pl-9"
            required
            disabled={isPending}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="h-10 w-full shadow-[0_10px_24px_rgba(40,81,159,0.22)]" disabled={isPending}>
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Se connecter
        {!isPending ? <ArrowRight className="ml-1 h-4 w-4" /> : null}
      </Button>
    </form>
  );
}