"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ScanLine, Tags, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { PermissionCode } from "@/lib/permissions/constants";

async function callWorkflowApi(id: number, action: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/dossiers/${id}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data;
}

interface Props {
  dossierId: number;
  permissions: PermissionCode[];
  statutValidation: string;
  statutNumerisation: string;
  statutIndexation: string;
  statutArchivage: string;
}

/** Actions de workflow (§42/§61) : chaque bouton n'apparaît que si la permission
 * ET la précondition d'état sont réunies — cohérent avec la vérification
 * stricte refaite côté serveur dans workflow-service.ts. */
export function ControleActions({ dossierId, permissions, statutValidation }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motif, setMotif] = useState("");

  if (statutValidation !== "EN_CONTROLE") return null;
  const canValidate = permissions.includes("DOSSIER_VALIDATE");
  const canReject = permissions.includes("DOSSIER_REJECT");
  if (!canValidate && !canReject) return null;

  function validate() {
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, "validate", {});
        toast.success("Dossier validé.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la validation.");
      }
    });
  }

  function reject() {
    if (!motif.trim()) {
      toast.error("Le motif de rejet est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, "reject", { commentaire: motif });
        toast.success("Dossier rejeté.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors du rejet.");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canValidate && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button disabled={isPending}><CheckCircle2 className="mr-1 h-4 w-4" />Valider</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Valider ce dossier ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le dossier passera au statut &laquo;&nbsp;Validé&nbsp;&raquo; et pourra ensuite être numérisé.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={validate}>Confirmer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canReject && (
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" disabled={isPending}><XCircle className="mr-1 h-4 w-4" />Rejeter</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeter ce dossier</DialogTitle>
              <DialogDescription>Un motif est obligatoire — il sera visible dans l&apos;historique du dossier.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="motif-rejet">Motif du rejet</Label>
              <Textarea id="motif-rejet" value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button variant="destructive" disabled={isPending} onClick={reject}>
                {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Confirmer le rejet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Statuts d'une étape pour lesquels l'opérateur ne peut pas (re)lancer l'action :
 * "A_VALIDER" (déjà soumise, en attente du superviseur) et "TERMINE" (déjà validée).
 * "REJETE" reste autorisé — c'est justement l'état qui permet à l'opérateur de relancer
 * l'action après un rejet (Phase 19+). */
const STAGE_BLOCKED_FOR_OPERATOR = new Set(["A_VALIDER", "TERMINE"]);

export function NumerisationActions({ dossierId, permissions, statutValidation, statutNumerisation }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (statutValidation !== "VALIDE" || STAGE_BLOCKED_FOR_OPERATOR.has(statutNumerisation)) return null;
  if (!permissions.includes("NUMERISATION_UPDATE")) return null;

  function run() {
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, "numerize", {});
        toast.success("Numérisation soumise, en attente de validation du superviseur.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la numérisation.");
      }
    });
  }

  return (
    <Button disabled={isPending} onClick={run}>
      {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ScanLine className="mr-1 h-4 w-4" />}
      {statutNumerisation === "REJETE" ? "Relancer la numérisation" : "Marquer numérisé"}
    </Button>
  );
}

export function IndexationActions({ dossierId, permissions, statutNumerisation, statutIndexation }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (statutNumerisation !== "TERMINE" || STAGE_BLOCKED_FOR_OPERATOR.has(statutIndexation)) return null;
  if (!permissions.includes("INDEXATION_UPDATE")) return null;

  function run() {
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, "index", {});
        toast.success("Indexation soumise, en attente de validation du superviseur.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'indexation.");
      }
    });
  }

  return (
    <Button disabled={isPending} onClick={run}>
      {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Tags className="mr-1 h-4 w-4" />}
      {statutIndexation === "REJETE" ? "Relancer l'indexation" : "Marquer indexé"}
    </Button>
  );
}

export function ArchivageActions({ dossierId, permissions, statutIndexation, statutArchivage }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [emplacement, setEmplacement] = useState("");
  const [reference, setReference] = useState("");

  if (statutIndexation !== "TERMINE" || STAGE_BLOCKED_FOR_OPERATOR.has(statutArchivage)) return null;
  if (!permissions.includes("ARCHIVAGE_UPDATE")) return null;

  function run() {
    if (!emplacement.trim()) {
      toast.error("L'emplacement est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, "archive", { emplacement, referenceArchivage: reference || undefined });
        toast.success("Archivage soumis, en attente de validation du superviseur.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button disabled={isPending}>
            <Archive className="mr-1 h-4 w-4" />
            {statutArchivage === "REJETE" ? "Relancer l'archivage" : "Archiver"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archiver ce dossier</DialogTitle>
          <DialogDescription>L&apos;emplacement physique d&apos;archivage est requis.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="emplacement">Emplacement</Label>
            <Input id="emplacement" value={emplacement} onChange={(e) => setEmplacement(e.target.value)} placeholder="Salle A / Rayon 3 / Boîte 12" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ref-archivage">Référence d&apos;archivage (optionnel)</Label>
            <Input id="ref-archivage" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={isPending} onClick={run}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Confirmer l&apos;archivage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Validation/rejet superviseur d'une étape (Phase 19+ : même principe que
 * ControleActions pour la Collecte, généralisé à Numérisation/Indexation/
 * Archivage — apparaît uniquement quand l'opérateur a soumis son travail
 * ("À valider"). Un rejet renvoie l'étape à l'opérateur pour qu'il la
 * relance (cf. STAGE_BLOCKED_FOR_OPERATOR ci-dessus, qui autorise l'action
 * depuis "Rejeté").
 */
function StageValidationActions({
  dossierId,
  permissions,
  statut,
  apiSegment,
  validatePermission,
  rejectPermission,
  stageLabel,
  nextStepHint,
}: {
  dossierId: number;
  permissions: PermissionCode[];
  statut: string;
  apiSegment: string;
  validatePermission: PermissionCode;
  rejectPermission: PermissionCode;
  stageLabel: string;
  nextStepHint: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motif, setMotif] = useState("");

  if (statut !== "A_VALIDER") return null;
  const canValidate = permissions.includes(validatePermission);
  const canReject = permissions.includes(rejectPermission);
  if (!canValidate && !canReject) return null;

  function validate() {
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, `${apiSegment}/validate`, {});
        toast.success(`${stageLabel} validée.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de la validation.");
      }
    });
  }

  function reject() {
    if (!motif.trim()) {
      toast.error("Le motif de rejet est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await callWorkflowApi(dossierId, `${apiSegment}/reject`, { commentaire: motif });
        toast.success(`${stageLabel} rejetée — renvoyée à l'opérateur.`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors du rejet.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
      <span className="mr-1 text-sm text-muted-foreground">Validation superviseur requise —</span>
      {canValidate && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" disabled={isPending}><CheckCircle2 className="mr-1 h-4 w-4" />Valider</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Valider cette étape ({stageLabel}) ?</AlertDialogTitle>
              <AlertDialogDescription>{nextStepHint}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={validate}>Confirmer</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canReject && (
        <Dialog>
          <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending}><XCircle className="mr-1 h-4 w-4" />Rejeter</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeter cette étape ({stageLabel})</DialogTitle>
              <DialogDescription>
                Un motif est obligatoire — il sera visible dans l&apos;historique. Le dossier reviendra à l&apos;opérateur pour qu&apos;il relance l&apos;action.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`motif-rejet-${apiSegment}`}>Motif du rejet</Label>
              <Textarea id={`motif-rejet-${apiSegment}`} value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button variant="destructive" disabled={isPending} onClick={reject}>
                {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Confirmer le rejet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function NumerisationValidationActions({ dossierId, permissions, statutNumerisation }: Props) {
  return (
    <StageValidationActions
      dossierId={dossierId}
      permissions={permissions}
      statut={statutNumerisation}
      apiSegment="numerize"
      validatePermission="NUMERISATION_VALIDATE"
      rejectPermission="NUMERISATION_REJECT"
      stageLabel="Numérisation"
      nextStepHint="Le dossier passera au statut « Terminé » et pourra ensuite être indexé."
    />
  );
}

export function IndexationValidationActions({ dossierId, permissions, statutIndexation }: Props) {
  return (
    <StageValidationActions
      dossierId={dossierId}
      permissions={permissions}
      statut={statutIndexation}
      apiSegment="index"
      validatePermission="INDEXATION_VALIDATE"
      rejectPermission="INDEXATION_REJECT"
      stageLabel="Indexation"
      nextStepHint="Le dossier passera au statut « Terminé » et pourra ensuite être archivé."
    />
  );
}

export function ArchivageValidationActions({ dossierId, permissions, statutArchivage }: Props) {
  return (
    <StageValidationActions
      dossierId={dossierId}
      permissions={permissions}
      statut={statutArchivage}
      apiSegment="archive"
      validatePermission="ARCHIVAGE_VALIDATE"
      rejectPermission="ARCHIVAGE_REJECT"
      stageLabel="Archivage"
      nextStepHint="Le dossier passera au statut « Terminé » — c'est la dernière étape du cycle."
    />
  );
}
