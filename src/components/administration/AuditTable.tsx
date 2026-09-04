"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Eye, ScrollText } from "lucide-react";

export interface AuditLogRowView {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  ipAddress: string | null;
  createdAt: string;
  oldValue: unknown;
  newValue: unknown;
  user: { id: number; name: string; email: string } | null;
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" });

const ACTION_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOGIN: "default",
  LOGOUT: "secondary",
  LOGIN_FAILED: "destructive",
  DOSSIER_REJECT: "destructive",
  DOSSIER_VALIDATE: "default",
  DOCUMENT_DELETE: "destructive",
  ANOMALIE_RESOLVE: "default",
};

function toneFor(action: string) {
  if (ACTION_TONE[action]) return ACTION_TONE[action];
  if (action.includes("DELETE") || action.includes("REJECT") || action.includes("FAILED")) return "destructive";
  if (action.includes("CREATE") || action.includes("VALIDATE") || action.includes("LOGIN")) return "default";
  return "secondary";
}

export function AuditTable({ rows }: { rows: AuditLogRowView[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-card/80 px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ScrollText className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Aucun événement</h2>
        <p className="mt-1 text-sm text-muted-foreground">Aucun événement ne correspond à ces critères.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-sm">
      <Table className="min-w-[920px]">
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Date</TableHead>
            <TableHead>Utilisateur</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entité</TableHead>
            <TableHead>IP</TableHead>
            <TableHead className="text-right">Détails</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="hover:bg-accent/30">
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateFmt.format(new Date(r.createdAt))}</TableCell>
              <TableCell className="whitespace-nowrap font-medium">{r.user ? r.user.name : <span className="text-muted-foreground">Système</span>}</TableCell>
              <TableCell>
                <Badge variant={toneFor(r.action)} className="rounded-md">{r.action}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.entity}
                {r.entityId ? <span className="text-muted-foreground"> #{r.entityId}</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.ipAddress ?? "—"}</TableCell>
              <TableCell className="text-right">
                {r.oldValue || r.newValue ? (
                  <Dialog>
                    <DialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Voir les détails" title="Voir les détails" />}>
                      <Eye className="h-4 w-4" />
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          {r.action} — {r.entity}
                          {r.entityId ? ` #${r.entityId}` : ""}
                        </DialogTitle>
                        <DialogDescription>
                          {dateFmt.format(new Date(r.createdAt))} par {r.user?.name ?? "Système"} ({r.ipAddress ?? "IP inconnue"})
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3">
                        {r.oldValue ? (
                          <div>
                            <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Avant</div>
                            <pre className="max-h-48 overflow-auto rounded-md border border-border/70 bg-muted p-2 text-xs">
                              {JSON.stringify(r.oldValue, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {r.newValue ? (
                          <div>
                            <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Après</div>
                            <pre className="max-h-48 overflow-auto rounded-md border border-border/70 bg-muted p-2 text-xs">
                              {JSON.stringify(r.newValue, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}