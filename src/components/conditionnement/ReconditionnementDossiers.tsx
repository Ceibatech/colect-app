"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play, Timer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ConditionnementDossierItem } from "@/lib/services/production-queue-service";
import {
  ETAT_REMISE_LABELS,
  ETAT_REMISE_QUESTION,
  formatDuration,
  isTakeoverAllowed,
  type EtatRemise,
} from "@/lib/workflow/reconditionnement";

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

async function post(dossierId: number, body: Record<string, unknown>) {
  const response = await fetch(`/api/conditionnement/dossiers/${dossierId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "L'opération n'a pas pu être enregistrée.");
  return data as { durationSeconds?: number };
}

/** Chrono qui tourne depuis le début du dossier. */
export function LiveTimer({ since }: { since: Date | string }) {
  const start = new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="font-mono tabular-nums">{formatDuration((now - start) / 1000)}</span>;
}

/**
 * Dossiers d'un carton au reconditionnement. Plusieurs agents travaillent sur
 * le même carton, chacun sur un dossier à la fois : « Commencer » lance le
 * chrono, « Terminer » demande si le dossier est remis dans son état initial.
 */
export function ReconditionnementDossiers({
  items,
  canUpdate,
  currentUserId,
  myOpenDossierId,
}: {
  items: ConditionnementDossierItem[];
  canUpdate: boolean;
  currentUserId: number;
  myOpenDossierId: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [finishing, setFinishing] = useState<ConditionnementDossierItem | null>(null);
  const [etat, setEtat] = useState<EtatRemise | "">("");
  const [observations, setObservations] = useState("");

  function act(dossierId: number, body: Record<string, unknown>, success: (data: { durationSeconds?: number }) => string) {
    startTransition(async () => {
      try {
        const data = await post(dossierId, body);
        toast.success(success(data));
        setFinishing(null);
        setEtat("");
        setObservations("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "L'opération n'a pas pu être enregistrée.");
      }
    });
  }

  // Bilan par agent : dossiers terminés et temps passé.
  const byAgent = new Map<string, { dossiers: number; seconds: number; reserves: number }>();
  for (const item of items) {
    for (const session of item.reconditionnementSessions) {
      if (!session.finishedAt || session.durationSeconds == null) continue;
      const row = byAgent.get(session.user.name) ?? { dossiers: 0, seconds: 0, reserves: 0 };
      row.dossiers += 1;
      row.seconds += session.durationSeconds;
      if (session.etatRemise === "AVEC_RESERVE") row.reserves += 1;
      byAgent.set(session.user.name, row);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Dossier</TableHead>
              <TableHead>Titulaire</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Temps</TableHead>
              <TableHead>Remise</TableHead>
              {canUpdate ? <TableHead className="text-right">Action</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const open = item.reconditionnementSessions.find((session) => !session.finishedAt) ?? null;
              const done = [...item.reconditionnementSessions].reverse().find((session) => session.finishedAt) ?? null;
              const mine = open?.userId === currentUserId;
              const otherBusy = open && !mine && !isTakeoverAllowed(new Date(open.startedAt));
              const finished = item.statutConditionnement === "TERMINE";
              return (
                <TableRow key={item.id} className={mine ? "bg-activity-conditionnement/10" : undefined}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">{item.reference}</TableCell>
                  <TableCell>{[item.nom, item.prenoms].filter(Boolean).join(" ") || "Non renseigné"}</TableCell>
                  <TableCell>
                    <Badge variant={finished ? "default" : open ? "secondary" : "outline"}>
                      {finished ? "Terminé" : open ? "En cours" : "À faire"}
                    </Badge>
                  </TableCell>
                  <TableCell>{open?.user.name ?? done?.user.name ?? item.conditionneur?.name ?? "—"}</TableCell>
                  <TableCell>
                    {open ? (
                      <span className="inline-flex items-center gap-1 text-sm"><Timer className="size-3.5" /> <LiveTimer since={open.startedAt} /></span>
                    ) : done ? (
                      <span className="text-sm">{formatDuration(done.durationSeconds)}<span className="block text-xs text-muted-foreground">{dateFormatter.format(new Date(done.finishedAt!))}</span></span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-64 text-sm">
                    {done?.etatRemise === "AVEC_RESERVE" ? (
                      <span><Badge variant="outline" className="border-brand-gold/50 text-brand-gold">Réserve</Badge> <span className="text-muted-foreground">{done.observations}</span></span>
                    ) : done?.etatRemise === "ETAT_INITIAL" ? (
                      <span className="text-muted-foreground">État initial</span>
                    ) : finished && item.observationsConditionnement ? (
                      <span className="text-muted-foreground">{item.observationsConditionnement}</span>
                    ) : "—"}
                  </TableCell>
                  {canUpdate ? (
                    <TableCell className="text-right">
                      {finished ? null : mine ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(item.id, { action: "release" }, () => `${item.reference} libéré.`)}><Undo2 /> Libérer</Button>
                          <Button size="sm" disabled={pending} onClick={() => setFinishing(item)}><CheckCircle2 /> Terminer</Button>
                        </div>
                      ) : otherBusy ? (
                        <span className="text-xs text-muted-foreground">Commencé à {timeFormatter.format(new Date(open.startedAt))}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending || (myOpenDossierId !== null && myOpenDossierId !== item.id)}
                          title={myOpenDossierId !== null ? "Terminez d'abord votre dossier en cours." : undefined}
                          onClick={() => act(item.id, { action: "start" }, () => `Chrono lancé pour ${item.reference}.`)}
                        >
                          {pending ? <Loader2 className="animate-spin" /> : <Play />} {open ? "Reprendre" : "Commencer"}
                        </Button>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {byAgent.size > 0 ? (
        <div className="border-t p-4">
          <h3 className="text-sm font-semibold">Temps par agent sur ce carton</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(byAgent.entries()).map(([name, row]) => (
              <li key={name} className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">{name}</p>
                <p className="text-muted-foreground">
                  {row.dossiers} dossier{row.dossiers > 1 ? "s" : ""} en {formatDuration(row.seconds)}, soit {formatDuration(row.seconds / row.dossiers)} par dossier
                  {row.reserves ? `, ${row.reserves} avec réserve` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog open={finishing !== null} onOpenChange={(open) => { if (!open) setFinishing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminer {finishing?.reference}</DialogTitle>
            <DialogDescription>Le temps passé sur ce dossier sera enregistré à votre nom.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{ETAT_REMISE_QUESTION}</legend>
              <RadioGroup value={etat} onValueChange={(value) => setEtat(value as EtatRemise)}>
                {(Object.keys(ETAT_REMISE_LABELS) as EtatRemise[]).map((key) => (
                  <Label key={key} htmlFor={`etat-${key}`} className="flex min-h-11 items-center gap-3 rounded-md border px-3 font-normal">
                    <RadioGroupItem value={key} id={`etat-${key}`} /> {ETAT_REMISE_LABELS[key]}
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="reconditionnement-observations">{etat === "AVEC_RESERVE" ? "Décrivez la réserve" : "Observation (facultatif)"}</Label>
              <Textarea
                id="reconditionnement-observations"
                rows={3}
                maxLength={2000}
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
                placeholder={etat === "AVEC_RESERVE" ? "Ex. une pièce manquante, chemise abîmée remplacée" : "Ex. agrafes remises, chemise neuve"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={pending || !finishing || !etat || (etat === "AVEC_RESERVE" && !observations.trim())}
              onClick={() => finishing && etat && act(finishing.id, { action: "finish", etat, observations }, (data) => `${finishing.reference} terminé en ${formatDuration(data.durationSeconds)}.`)}
            >
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Enregistrer et terminer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
