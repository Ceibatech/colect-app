"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createUser, updateUser, resetUserPassword, type ActionResult } from "@/lib/services/user-admin-service";
import { cn } from "@/lib/utils";
import { SendPendingUsersAccessDialog, SendUserAccessButton } from "@/components/administration/UserAccessEmailControls";
import { getRoleLabel, ROLE_CODES, type RoleCode } from "@/lib/permissions/constants";
import { normalizePersonName, personInitials } from "@/lib/utils/person-name";

export interface UserRow {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: number; code: string; name: string };
  operateur: { id: number; matricule: string; isActive: boolean } | null;
  supervisedCount: number;
  pmoSupervisorIds: number[];
}

export interface RoleOption {
  id: number;
  code: string;
  name: string;
}

/** Opérateur actif disponible pour affectation à un superviseur (Phase 16+). */
export interface OperateurOption {
  id: number;
  matricule: string;
  nom: string;
  prenoms: string | null;
  supervisorId: number | null;
  supervisorName: string | null;
}

export interface SupervisorOption {
  id: number;
  name: string;
  email: string;
  operatorCount: number;
}

const initialState: ActionResult = {};

function displayRoleName(role: Pick<RoleOption, "code" | "name">) {
  if (ROLE_CODES.includes(role.code as RoleCode)) return getRoleLabel(role.code as RoleCode);
  return role.name.replace(/CEIBAC/gi, "CEIBA");
}

function roleBadgeClass(code: string) {
  if (["ADMIN", "SUPERVISEUR"].includes(code)) return "border-primary/25 bg-primary/8 text-primary";
  if (["GESTIONNAIRE_TRANSFERT", "VALIDATEUR_CEIBAC", "VALIDATEUR_MINISTERE"].includes(code)) return "border-brand-green/30 bg-brand-green/10 text-brand-green";
  if (code === "FINANCE") return "border-brand-gold/35 bg-brand-gold/10 text-brand-gold";
  if (["EXECUTIF", "PMO", "CONSULTATION"].includes(code)) return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  return "border-border bg-muted/60 text-foreground";
}

function RoleSelect({
  roles,
  defaultRoleId,
  disabled,
  value,
  onValueChange,
}: {
  roles: RoleOption[];
  defaultRoleId?: number;
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const items = roles.map((r) => ({ label: displayRoleName(r), value: String(r.id), code: r.code }));
  return (
    <Select
      name="roleId"
      items={items}
      defaultValue={value === undefined && defaultRoleId ? String(defaultRoleId) : undefined}
      value={value}
      onValueChange={(v) => onValueChange?.(v ?? "")}
      disabled={disabled}
    >
      <SelectTrigger className="w-full" id="roleId">
        <SelectValue placeholder="Choisir un rôle" />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex w-full items-center justify-between gap-3">
              <span>{o.label}</span>
              {o.code === "EXECUTIF" || o.code === "PMO" ? (
                <span className="rounded-sm border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium uppercase text-primary">
                  Lecture seule
                </span>
              ) : o.code === "FINANCE" ? (
                <span className="rounded-sm border border-brand-gold/30 bg-brand-gold/8 px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand-gold">
                  Budget
                </span>
              ) : o.code === "GESTIONNAIRE_TRANSFERT" || o.code === "VALIDATEUR_CEIBAC" || o.code === "VALIDATEUR_MINISTERE" ? (
                <span className="rounded-sm border border-brand-green/30 bg-brand-green/8 px-1.5 py-0.5 text-[10px] font-medium uppercase text-brand-green">
                  Transferts
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Case à cocher par opérateur pour affecter un groupe à un superviseur
 * (Phase 16+, cf. Operateur.supervisorId). Coché/décoché est géré en état
 * local (pas de participation native au form via `name` sur chaque
 * Checkbox — trop incertain à travers les rerenders de Base UI) ; la
 * sélection finale est soumise via des `<input type="hidden">` dédiés.
 */
function OperateurAssignmentField({
  operateurs,
  currentSupervisorUserId,
  selected,
  onToggle,
  disabled,
}: {
  operateurs: OperateurOption[];
  currentSupervisorUserId: number;
  selected: number[];
  onToggle: (id: number, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Opérateurs affectés</Label>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
        {operateurs.length === 0 ? (
          <p className="p-1 text-xs text-muted-foreground">Aucun opérateur actif.</p>
        ) : (
          operateurs.map((o) => {
            const checked = selected.includes(o.id);
            const assignedElsewhere = o.supervisorId !== null && o.supervisorId !== currentSupervisorUserId;
            return (
              <div
                key={o.id}
                className={cn(
                  "flex items-center gap-2 rounded px-1 py-1",
                  assignedElsewhere ? "opacity-60" : "hover:bg-muted/50"
                )}
              >
                <Checkbox
                  id={`op-assign-${o.id}`}
                  checked={checked}
                  onCheckedChange={(v) => onToggle(o.id, v === true)}
                  disabled={disabled || assignedElsewhere}
                />
                <Label
                  htmlFor={`op-assign-${o.id}`}
                  className={cn("flex-1 font-normal", assignedElsewhere ? "cursor-not-allowed" : "cursor-pointer")}
                >
                  {normalizePersonName(`${o.nom} ${o.prenoms ?? ""}`)} <span className="text-xs text-muted-foreground">{o.matricule}</span>
                </Label>
                {assignedElsewhere ? (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    déjà affecté à {o.supervisorName}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ce superviseur ne pourra valider et consulter que les dossiers de ces opérateurs. Un opérateur déjà
        affecté à un autre superviseur (grisé ci-dessus) doit d&apos;abord être retiré de sa fiche avant de
        pouvoir être réaffecté ici.
      </p>
      {selected.map((id) => (
        <input key={id} type="hidden" name="operateurIds" value={id} />
      ))}
    </div>
  );
}

function PmoSupervisorAssignmentField({
  supervisors,
  selected,
  onToggle,
  disabled,
}: {
  supervisors: SupervisorOption[];
  selected: number[];
  onToggle: (id: number, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Superviseurs du périmètre</Label>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
        {supervisors.length === 0 ? (
          <p className="p-1 text-xs text-muted-foreground">Aucun superviseur actif.</p>
        ) : supervisors.map((supervisor) => (
          <div key={supervisor.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
            <Checkbox
              id={`pmo-supervisor-${supervisor.id}`}
              checked={selected.includes(supervisor.id)}
              onCheckedChange={(value) => onToggle(supervisor.id, value === true)}
              disabled={disabled}
            />
            <Label htmlFor={`pmo-supervisor-${supervisor.id}`} className="min-w-0 flex-1 cursor-pointer font-normal">
              <span className="block truncate font-medium">{normalizePersonName(supervisor.name)}</span>
              <span className="block truncate text-xs text-muted-foreground">{supervisor.operatorCount} opérateur{supervisor.operatorCount > 1 ? "s" : ""} · {supervisor.email}</span>
            </Label>
          </div>
        ))}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Le compte PMO verra uniquement les tableaux de bord des équipes rattachées à ces superviseurs.</p>
      {selected.map((id) => <input key={id} type="hidden" name="supervisorIds" value={id} />)}
    </div>
  );
}
function CreateUserForm({ roles, supervisors, onSuccess }: { roles: RoleOption[]; supervisors: SupervisorOption[]; onSuccess: (message?: string, warning?: string) => void }) {
  const [state, formAction, isPending] = useActionState(createUser, initialState);
  const [roleId, setRoleId] = useState("");
  const isPmo = roles.find((role) => String(role.id) === roleId)?.code === "PMO";
  const [selectedSupervisors, setSelectedSupervisors] = useState<number[]>([]);
  const toggleSupervisor = useCallback((id: number, checked: boolean) => {
    setSelectedSupervisors((previous) => (checked && !previous.includes(id) ? [...previous, id] : checked ? previous : previous.filter((value) => value !== id)));
  }, []);

  // `onSuccess` doit être mémoïsé (useCallback) côté appelant — voir
  // CommunesManager.tsx pour le détail.
  useEffect(() => {
    if (state.success) onSuccess(state.message, state.warning);
  }, [state.success, state.message, state.warning, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="name">Nom complet</Label>
        <Input id="name" name="name" maxLength={150} required disabled={isPending} className="uppercase" />
        <p className="text-xs text-muted-foreground">Le nom est automatiquement harmonisé en majuscules.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" maxLength={150} required disabled={isPending} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe initial</Label>
        <Input id="password" name="password" type="password" minLength={8} required disabled={isPending} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">Au moins 8 caractères. L&apos;invitation permettra à la personne de le remplacer avant sa première connexion.</p>
      </div>
      <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
        <Checkbox id="sendInvitation" name="sendInvitation" defaultChecked disabled={isPending} />
        <div className="space-y-1">
          <Label htmlFor="sendInvitation" className="cursor-pointer font-medium">Envoyer l&apos;invitation par e-mail</Label>
          <p className="text-xs leading-5 text-muted-foreground">Un lien personnel valable 60 minutes permettra de définir un nouveau mot de passe.</p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="roleId">Rôle</Label>
        <RoleSelect roles={roles} value={roleId} onValueChange={setRoleId} disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="telephone">Téléphone (optionnel — utile si rôle Opérateur)</Label>
        <Input id="telephone" name="telephone" maxLength={30} disabled={isPending} />
      </div>
      {isPmo ? (
        <PmoSupervisorAssignmentField
          supervisors={supervisors}
          selected={selectedSupervisors}
          onToggle={toggleSupervisor}
          disabled={isPending}
        />
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Créer le compte
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditUserForm({
  user,
  roles,
  operateurs,
  supervisors,
  onSuccess,
  canDeactivate,
}: {
  user: UserRow;
  roles: RoleOption[];
  operateurs: OperateurOption[];
  supervisors: SupervisorOption[];
  onSuccess: () => void;
  canDeactivate: boolean;
}) {
  const boundAction = updateUser.bind(null, user.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const [roleId, setRoleId] = useState(String(user.role.id));
  const selectedRoleCode = roles.find((r) => String(r.id) === roleId)?.code;
  const isSuperviseur = selectedRoleCode === "SUPERVISEUR";
  const isPmo = selectedRoleCode === "PMO";

  const [selectedOperateurs, setSelectedOperateurs] = useState<number[]>(() =>
    operateurs.filter((o) => o.supervisorId === user.id).map((o) => o.id)
  );
  const toggleOperateur = useCallback((id: number, checked: boolean) => {
    setSelectedOperateurs((prev) => (checked && !prev.includes(id) ? [...prev, id] : checked ? prev : prev.filter((x) => x !== id)));
  }, []);
  const [selectedSupervisors, setSelectedSupervisors] = useState<number[]>(user.pmoSupervisorIds);
  const toggleSupervisor = useCallback((id: number, checked: boolean) => {
    setSelectedSupervisors((prev) => (checked && !prev.includes(id) ? [...prev, id] : checked ? prev : prev.filter((x) => x !== id)));
  }, []);

  // `onSuccess` doit être mémoïsé (useCallback) côté appelant — voir
  // CommunesManager.tsx pour le détail.
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="edit-name">Nom complet</Label>
        <Input id="edit-name" name="name" defaultValue={normalizePersonName(user.name)} maxLength={150} required disabled={isPending} className="uppercase" />
      </div>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input value={user.email} disabled />
        <p className="text-xs text-muted-foreground">L&apos;e-mail n&apos;est pas modifiable ici.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-roleId">Rôle</Label>
        <RoleSelect roles={roles} value={roleId} onValueChange={setRoleId} disabled={isPending} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="edit-isActive" name="isActive" defaultChecked={user.isActive} disabled={isPending || !canDeactivate} />
        <Label htmlFor="edit-isActive" className="font-normal">
          Compte actif {!canDeactivate ? "(vous ne pouvez pas désactiver votre propre compte)" : ""}
        </Label>
      </div>
      {isSuperviseur ? (
        <OperateurAssignmentField
          operateurs={operateurs}
          currentSupervisorUserId={user.id}
          selected={selectedOperateurs}
          onToggle={toggleOperateur}
          disabled={isPending}
        />
      ) : null}
      {isPmo ? (
        <PmoSupervisorAssignmentField
          supervisors={supervisors}
          selected={selectedSupervisors}
          onToggle={toggleSupervisor}
          disabled={isPending}
        />
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

function ResetPasswordForm({ userId, onSuccess }: { userId: number; onSuccess: () => void }) {
  const boundAction = resetUserPassword.bind(null, userId);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  // `onSuccess` doit être mémoïsé (useCallback) côté appelant — voir
  // CommunesManager.tsx pour le détail.
  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="newPassword">Nouveau mot de passe</Label>
        <Input id="newPassword" name="newPassword" type="password" minLength={8} required disabled={isPending} autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmer</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required disabled={isPending} autoComplete="new-password" />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Réinitialiser le mot de passe
        </Button>
      </DialogFooter>
    </form>
  );
}

export function UsersManager({
  users,
  roles,
  operateurs,
  supervisors,
  currentUserId,
}: {
  users: UserRow[];
  roles: RoleOption[];
  operateurs: OperateurOption[];
  supervisors: SupervisorOption[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);

  const onSuccessCreate = useCallback((message?: string, warning?: string) => {
    setCreateOpen(false);
    if (warning) toast.warning(warning);
    else toast.success(message ?? "Compte créé.");
    router.refresh();
  }, [router]);
  const onSuccessEdit = useCallback(() => {
    setEditId(null);
    toast.success("Utilisateur mis à jour.");
    router.refresh();
  }, [router]);
  const onSuccessReset = useCallback(() => {
    setResetId(null);
    toast.success("Mot de passe réinitialisé.");
    router.refresh();
  }, [router]);

  const editing = users.find((u) => u.id === editId);
  const pendingAccessCount = users.filter((user) => user.isActive && !user.lastLoginAt).length;

  const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-end gap-2 sm:flex-row">
        <SendPendingUsersAccessDialog pendingCount={pendingAccessCount} />
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouvel utilisateur</Button>} />
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Choisissez le niveau d&apos;accès adapté. Exécutif dispose d&apos;une lecture globale, PMO d&apos;un périmètre d&apos;équipes et Finance des points et budgets. Aucun de ces profils ne saisit de dossier.
              </DialogDescription>
            </DialogHeader>
            <CreateUserForm roles={roles} supervisors={supervisors} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="overflow-x-auto">
        <Table className="min-w-[1040px]">
          <TableHeader className="bg-muted/45">
            <TableRow className="hover:bg-muted/45">
              <TableHead className="h-11 w-[28%] text-[11px] font-semibold uppercase">Identité</TableHead>
              <TableHead className="h-11 w-[24%] text-[11px] font-semibold uppercase">E-mail professionnel</TableHead>
              <TableHead className="h-11 w-[22%] text-[11px] font-semibold uppercase">Rôle et périmètre</TableHead>
              <TableHead className="h-11 w-[10%] text-[11px] font-semibold uppercase">Statut</TableHead>
              <TableHead className="h-11 w-[12%] text-[11px] font-semibold uppercase">Dernier accès</TableHead>
              <TableHead className="h-11 w-[4%] text-right text-[11px] font-semibold uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="h-[58px] hover:bg-primary/[0.035]">
                <TableCell className="whitespace-nowrap py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/15 bg-primary/8 text-xs font-bold text-primary">
                      {personInitials(u.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{normalizePersonName(u.name)}</p>
                      {u.id === currentUserId ? <span className="mt-0.5 inline-block text-[11px] font-medium text-primary">VOTRE COMPTE</span> : <span className="mt-0.5 block text-[11px] text-muted-foreground">ID {String(u.id).padStart(4, "0")}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{u.email.toLowerCase()}</TableCell>
                <TableCell className="py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={cn("rounded-md font-medium", roleBadgeClass(u.role.code))}>{displayRoleName(u.role)}</Badge>
                    {u.operateur ? <span className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{u.operateur.matricule}</span> : null}
                  </div>
                  {u.role.code === "SUPERVISEUR" ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {u.supervisedCount} opérateur{u.supervisedCount > 1 ? "s" : ""}
                    </span>
                  ) : u.role.code === "PMO" ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {u.pmoSupervisorIds.length} superviseur{u.pmoSupervisorIds.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex min-w-[78px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase",
                    u.isActive ? "border-brand-green/25 bg-brand-green/10 text-brand-green" : "border-destructive/25 bg-destructive/10 text-destructive"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", u.isActive ? "bg-brand-green" : "bg-destructive")} />
                    {u.isActive ? "Actif" : "Désactivé"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {u.lastLoginAt ? <span className="text-muted-foreground">{dateFmt.format(new Date(u.lastLoginAt))}</span> : <span className="font-medium text-brand-gold">Jamais connecté</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" title="Modifier le compte" onClick={() => setEditId(u.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <SendUserAccessButton userId={u.id} email={u.email} disabled={!u.isActive} />
                    <Button size="icon-sm" variant="ghost" aria-label="Réinitialiser le mot de passe manuellement" title="Réinitialiser le mot de passe" onClick={() => setResetId(u.id)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </div>

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
            <DialogDescription>Le changement de rôle prendra effet à la prochaine connexion de l&apos;utilisateur.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <EditUserForm
              user={editing}
              roles={roles}
              operateurs={operateurs}
              supervisors={supervisors}
              onSuccess={onSuccessEdit}
              canDeactivate={editing.id !== currentUserId}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={resetId !== null} onOpenChange={(open) => !open && setResetId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>Utilisez cette option uniquement si l&apos;envoi sécurisé par e-mail n&apos;est pas disponible.</DialogDescription>
          </DialogHeader>
          {resetId !== null ? <ResetPasswordForm userId={resetId} onSuccess={onSuccessReset} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
