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
import { Eye } from "lucide-react";

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
    return <div className="rounded-lg border py-16 text-center text-sm text-muted-foreground">Aucun événement pour ces critères.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-xs">{dateFmt.format(new Date(r.createdAt))}</TableCell>
              <TableCell className="whitespace-nowrap">{r.user ? r.user.name : <span className="text-muted-foreground">Système</span>}</TableCell>
              <TableCell>
                <Badge variant={toneFor(r.action)}>{r.action}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {r.entity}
                {r.entityId ? <span className="text-muted-foreground"> #{r.entityId}</span> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.ipAddress ?? "—"}</TableCell>
              <TableCell className="text-right">
                {(r.oldValue || r.newValue) ? (
                  <Dialog>
                    <DialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Voir les détails" />}>
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
                            <div className="mb-1 text-xs font-medium text-muted-foreground">Avant</div>
                            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
                              {JSON.stringify(r.oldValue, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {r.newValue ? (
                          <div>
                            <div className="mb-1 text-xs font-medium text-muted-foreground">Après</div>
                            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
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
