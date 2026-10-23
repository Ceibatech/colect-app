"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ConditionnementCartonItem } from "@/lib/services/production-queue-service";

export function ConditionnementCartonQueue({ cartons, canUpdate, currentUserId }: { cartons: ConditionnementCartonItem[]; canUpdate: boolean; currentUserId: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [observations, setObservations] = useState("");
  const [pending, startTransition] = useTransition();
  const selectedItems = useMemo(() => cartons.filter((carton) => selected.has(carton.token)), [cartons, selected]);
  const canComplete = selectedItems.length > 0 && selectedItems.every((carton) => carton.enCours > 0 && carton.activeClaimUserIds.every((id) => id === currentUserId));

  function toggle(token: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(token); else next.delete(token);
      return next;
    });
  }

  function run(operation: "claim" | "complete") {
    if (selected.size === 0) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/conditionnement/cartons/${operation}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cartons: Array.from(selected), observations }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "L'opération n'a pas pu être terminée.");
        toast.success(operation === "claim" ? `${data.dossierCount ?? 0} dossier(s) pris en charge.` : `${data.dossierCount ?? 0} dossier(s) reconditionné(s) et transmis à l’indexation.`);
        setSelected(new Set());
        setObservations("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "L'opération n'a pas pu être terminée.");
      }
    });
  }

  if (cartons.length === 0) return <div className="border-t px-6 py-14 text-center text-sm text-muted-foreground">Aucun carton dans cette file.</div>;
  return (
    <div className="border-t">
      {canUpdate ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-muted/25 p-4">
          <label className="min-w-64 flex-1"><span className="mb-1 block text-xs font-medium text-muted-foreground">Constat de reconditionnement</span><Input value={observations} onChange={(event) => setObservations(event.target.value)} placeholder="Ex. chemises remises en ordre, carton refermé et étiqueté" disabled={pending} /></label>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending || selected.size === 0 || canComplete} onClick={() => run("claim")}>{pending ? <Loader2 className="animate-spin" /> : <PackageCheck />}Prendre en charge</Button><Button size="sm" disabled={pending || !canComplete} onClick={() => run("complete")}>{pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Terminer</Button></div>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <Table className="min-w-[950px]">
          <TableHeader><TableRow className="bg-muted/55 hover:bg-muted/55">{canUpdate ? <TableHead className="w-12 pl-5" /> : null}<TableHead>Carton</TableHead><TableHead>Site</TableHead><TableHead>Dossiers</TableHead><TableHead>Avancement</TableHead><TableHead>Conditionné par</TableHead><TableHead className="text-right">Détail</TableHead></TableRow></TableHeader>
          <TableBody>{cartons.map((carton) => {
            const lockedByOther = carton.activeClaimUserIds.some((id) => id !== currentUserId);
            return <TableRow key={carton.token}>{canUpdate ? <TableCell className="pl-5"><Checkbox checked={selected.has(carton.token)} disabled={pending || lockedByOther || carton.termines === carton.totalDossiers} onCheckedChange={(value) => toggle(carton.token, value === true)} aria-label={`Sélectionner ${carton.label}`} /></TableCell> : null}<TableCell><p className="font-mono text-sm font-semibold text-primary">{carton.label}</p>{carton.description ? <p className="text-xs text-muted-foreground">{carton.description}</p> : null}</TableCell><TableCell>{carton.site}</TableCell><TableCell className="font-semibold tabular-nums">{carton.totalDossiers}</TableCell><TableCell><div className="flex flex-wrap gap-1">{carton.aConditionner > 0 ? <Badge variant="outline">{carton.aConditionner} à faire</Badge> : null}{carton.enCours > 0 ? <Badge variant="secondary">{carton.enCours} en cours</Badge> : null}{carton.termines > 0 ? <Badge>{carton.termines} terminé(s)</Badge> : null}</div></TableCell><TableCell>{carton.agents.join(", ") || "Non attribué"}</TableCell><TableCell className="text-right"><Link href={`/conditionnement?statut=TOUS&carton=${encodeURIComponent(carton.token)}`} className={buttonVariants({ size: "sm", variant: "outline" })}>Voir les dossiers</Link></TableCell></TableRow>;
          })}</TableBody>
        </Table>
      </div>
    </div>
  );
}
