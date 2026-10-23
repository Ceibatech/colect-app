"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, MailCheck, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getRoleLabel, ROLE_CODES, type RoleCode } from "@/lib/permissions/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sendEmailReportNowAction, updateEmailReportConfiguration, type EmailReportActionResult } from "@/lib/services/email-report-actions";

interface SubscriptionRow {
  id: number;
  frequency: string;
  dayOfWeek: number;
  dayOfMonth: number;
  hourUtc: number;
  includePoints: boolean;
  isActive: boolean;
  nextSendAt: string;
  lastSentAt: string | null;
}

interface RecipientRow {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  role: { code: string; name: string };
  supervisedCount: number;
  subscription: SubscriptionRow | null;
}

interface DeliveryRow {
  id: number;
  status: string;
  triggerType: string;
  sentAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  recipient: { name: string; email: string };
}

const initialState: EmailReportActionResult = {};
const WEEK_DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 7, label: "Dimanche" },
];

function formatDate(value: string | null) {
  if (!value) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Abidjan" }).format(new Date(value));
}

function displayRoleName(role: RecipientRow["role"]) {
  return ROLE_CODES.includes(role.code as RoleCode) ? getRoleLabel(role.code as RoleCode) : role.name;
}

function RecipientConfiguration({ recipient }: { recipient: RecipientRow }) {
  const [frequency, setFrequency] = useState(recipient.subscription?.frequency ?? "WEEKLY");
  const [saveState, saveAction, saving] = useActionState(updateEmailReportConfiguration, initialState);
  const [sendState, sendAction, sending] = useActionState(sendEmailReportNowAction, initialState);

  useEffect(() => {
    if (saveState.success) toast.success(saveState.message);
    if (saveState.error) toast.error(saveState.error);
  }, [saveState]);
  useEffect(() => {
    if (sendState.success) toast.success(sendState.message);
    if (sendState.error) toast.error(sendState.error);
  }, [sendState]);

  return (
    <TableRow className="align-top">
      <TableCell className="min-w-56 py-4">
        <p className="font-semibold uppercase">{recipient.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{recipient.email.toLowerCase()}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline" className="rounded-md">{displayRoleName(recipient.role)}</Badge>
          {recipient.role.code === "SUPERVISEUR" ? <Badge variant="secondary" className="rounded-md">{recipient.supervisedCount} opérateur{recipient.supervisedCount > 1 ? "s" : ""}</Badge> : null}
          {!recipient.isActive ? <Badge variant="destructive" className="rounded-md">Compte inactif</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[420px] py-4">
        <form action={saveAction} className="grid gap-3 sm:grid-cols-[9rem_9rem_7rem_auto] sm:items-end">
          <input type="hidden" name="userId" value={recipient.id} />
          <div className="space-y-1.5">
            <Label htmlFor={`frequency-${recipient.id}`}>Fréquence</Label>
            <select id={`frequency-${recipient.id}`} name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)} disabled={saving} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="DAILY">Chaque jour</option>
              <option value="WEEKLY">Chaque semaine</option>
              <option value="MONTHLY">Chaque mois</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`schedule-day-${recipient.id}`}>{frequency === "MONTHLY" ? "Jour du mois" : frequency === "WEEKLY" ? "Jour" : "Récurrence"}</Label>
            {frequency === "WEEKLY" ? (
              <select id={`schedule-day-${recipient.id}`} name="dayOfWeek" defaultValue={recipient.subscription?.dayOfWeek ?? 1} disabled={saving} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {WEEK_DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
            ) : frequency === "MONTHLY" ? (
              <select id={`schedule-day-${recipient.id}`} name="dayOfMonth" defaultValue={recipient.subscription?.dayOfMonth ?? 1} disabled={saving} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Jour {day}</option>)}
              </select>
            ) : <div className="flex h-9 items-center rounded-md border bg-muted/35 px-3 text-sm text-muted-foreground">Quotidienne</div>}
            {frequency !== "WEEKLY" ? <input type="hidden" name="dayOfWeek" value={recipient.subscription?.dayOfWeek ?? 1} /> : null}
            {frequency !== "MONTHLY" ? <input type="hidden" name="dayOfMonth" value={recipient.subscription?.dayOfMonth ?? 1} /> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`hour-${recipient.id}`}>Heure</Label>
            <select id={`hour-${recipient.id}`} name="hourUtc" defaultValue={recipient.subscription?.hourUtc ?? 7} disabled={saving} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={saving || !recipient.isActive}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Enregistrer
          </Button>
          <div className="flex flex-wrap gap-5 sm:col-span-4">
            <label className="flex items-center gap-2 text-sm"><Checkbox name="isActive" defaultChecked={recipient.subscription?.isActive ?? false} disabled={saving || !recipient.isActive} />Diffusion active</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox name="includePoints" defaultChecked={recipient.subscription?.includePoints ?? true} disabled={saving} />Inclure les points</label>
          </div>
        </form>
      </TableCell>
      <TableCell className="min-w-44 py-4 text-xs">
        <p><span className="text-muted-foreground">Prochain :</span> {recipient.subscription ? formatDate(recipient.subscription.nextSendAt) : "Non programmé"}</p>
        <p className="mt-2"><span className="text-muted-foreground">Dernier :</span> {formatDate(recipient.subscription?.lastSentAt ?? null)}</p>
      </TableCell>
      <TableCell className="py-4 text-right">
        <form action={sendAction}>
          <input type="hidden" name="userId" value={recipient.id} />
          <Button type="submit" size="sm" variant="outline" disabled={sending || !recipient.subscription || !recipient.isActive} title="Envoyer le rapport maintenant">
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Envoyer
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}

export function EmailReportsManager({ recipients, deliveries, emailConfigured }: { recipients: RecipientRow[]; deliveries: DeliveryRow[]; emailConfigured: boolean }) {
  return (
    <div className="space-y-5">
      {!emailConfigured ? <Alert variant="destructive"><AlertDescription>Le service d&apos;e-mail serveur n&apos;est pas configuré. Ajoutez une clé Resend et un expéditeur vérifié avant d&apos;activer une diffusion.</AlertDescription></Alert> : null}
      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <Table className="min-w-[1120px]">
          <TableHeader className="bg-muted/45"><TableRow><TableHead>Destinataire</TableHead><TableHead>Programmation</TableHead><TableHead>Suivi</TableHead><TableHead className="text-right">Envoi</TableHead></TableRow></TableHeader>
          <TableBody>{recipients.map((recipient) => <RecipientConfiguration key={recipient.id} recipient={recipient} />)}</TableBody>
        </Table>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 className="font-semibold">Journal de diffusion</h2><p className="mt-1 text-xs text-muted-foreground">30 derniers envois</p></div>
          <MailCheck className="h-5 w-5 text-brand-green" />
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader><TableRow><TableHead>Destinataire</TableHead><TableHead>Déclenchement</TableHead><TableHead>État</TableHead><TableHead className="text-right">Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell><p className="font-medium uppercase">{delivery.recipient.name}</p><p className="text-xs text-muted-foreground">{delivery.recipient.email}</p></TableCell>
                  <TableCell>{delivery.triggerType === "MANUAL" ? "Manuel" : "Programmé"}</TableCell>
                  <TableCell><Badge variant={delivery.status === "SENT" ? "outline" : delivery.status === "FAILED" ? "destructive" : "secondary"} className={delivery.status === "SENT" ? "rounded-md border-brand-green/25 bg-brand-green/8 text-brand-green" : "rounded-md"}>{delivery.status === "SENT" ? "Envoyé" : delivery.status === "FAILED" ? "Échec" : "En cours"}</Badge>{delivery.errorMessage ? <p className="mt-1 max-w-md truncate text-xs text-destructive" title={delivery.errorMessage}>{delivery.errorMessage}</p> : null}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{formatDate(delivery.sentAt ?? delivery.createdAt)}</TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 ? <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">Aucun envoi enregistré.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
