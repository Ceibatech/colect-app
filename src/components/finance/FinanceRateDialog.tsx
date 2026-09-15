"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { createFinanceRate, type FinanceRateActionResult } from "@/lib/services/finance-rate-service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: FinanceRateActionResult = {};

export function FinanceRateDialog({
  defaultEffectiveFrom,
  currentOperatorValue,
  currentSupervisorValue,
  currency,
}: {
  defaultEffectiveFrom: string;
  currentOperatorValue?: number;
  currentSupervisorValue?: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createFinanceRate, initialState);

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.message ?? "Barème enregistré.");
    const closeTimer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(closeTimer);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <SlidersHorizontal />
        Planifier un barème
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau barème</DialogTitle>
          <DialogDescription>
            Le barème entre en vigueur à la date choisie. Les périodes déjà couvertes conservent leur valeur historique.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="operatorPointValue">Point opérateur</Label>
              <Input id="operatorPointValue" name="operatorPointValue" type="number" min="0" step="0.01" defaultValue={currentOperatorValue ?? 0} required disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisorPointValue">Point superviseur</Label>
              <Input id="supervisorPointValue" name="supervisorPointValue" type="number" min="0" step="0.01" defaultValue={currentSupervisorValue ?? 0} required disabled={isPending} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Input id="currency" name="currency" maxLength={3} defaultValue={currency} required readOnly disabled={isPending} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Date d&apos;effet</Label>
              <Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={defaultEffectiveFrom} required disabled={isPending} />
            </div>
          </div>
          <Alert>
            <AlertDescription>
              Une activité opérateur vaut un point après acceptation. Une validation ou un rejet prononcé vaut un point superviseur.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Enregistrer le barème
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}