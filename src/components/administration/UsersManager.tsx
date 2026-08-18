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

export interface UserRow {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: number; code: string; name: string };
  operateur: { id: number; matricule: string; isActive: boolean } | null;
  supervisedCount: number;
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

const initialState: ActionResult = {};

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
  const items = roles.map((r) => ({ label: r.name, value: String(r.id) }));
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
            {o.label}
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
              <div key={o.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                <Checkbox
                  id={`op-assign-${o.id}`}
                  checked={checked}
                  onCheckedChange={(v) => onToggle(o.id, v === true)}
                  disabled={disabled}
                />
                <Label htmlFor={`op-assign-${o.id}`} className="flex-1 cursor-pointer font-normal">
                  {o.nom} {o.prenoms ?? ""} <span className="text-xs text-muted-foreground">{o.matricule}</span>
                </Label>
                {assignedElsewhere ? (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    actuel : {o.supervisorName}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Ce superviseur ne pourra valider et consulter que les dossiers de ces opérateurs.
      </p>
      {selected.map((id) => (
        <input key={id} type="hidden" name="operateurIds" value={id} />
      ))}
    </div>
  );
}

function CreateUserForm({ roles, onSuccess }: { roles: RoleOption[]; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(createUser, initialState);

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
        <Label htmlFor="name">Nom complet</Label>
        <Input id="name" name="name" maxLength={150} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" maxLength={150} required disabled={isPending} autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe initial</Label>
        <Input id="password" name="password" type="password" minLength={8} required disabled={isPending} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">Au moins 8 caractères — transmettez-le à l&apos;intéressé(e) par un canal sûr.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="roleId">Rôle</Label>
        <RoleSelect roles={roles} disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="telephone">Téléphone (optionnel — utile si rôle Opérateur)</Label>
        <Input id="telephone" name="telephone" maxLength={30} disabled={isPending} />
      </div>
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
  onSuccess,
  canDeactivate,
}: {
  user: UserRow;
  roles: RoleOption[];
  operateurs: OperateurOption[];
  onSuccess: () => void;
  canDeactivate: boolean;
}) {
  const boundAction = updateUser.bind(null, user.id);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const [roleId, setRoleId] = useState(String(user.role.id));
  const selectedRoleCode = roles.find((r) => String(r.id) === roleId)?.code;
  const isSuperviseur = selectedRoleCode === "SUPERVISEUR";

  const [selectedOperateurs, setSelectedOperateurs] = useState<number[]>(() =>
    operateurs.filter((o) => o.supervisorId === user.id).map((o) => o.id)
  );
  const toggleOperateur = useCallback((id: number, checked: boolean) => {
    setSelectedOperateurs((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
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
        <Input id="edit-name" name="name" defaultValue={user.name} maxLength={150} required disabled={isPending} />
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
  currentUserId,
}: {
  users: UserRow[];
  roles: RoleOption[];
  operateurs: OperateurOption[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);

  const onSuccessCreate = useCallback(() => {
    setCreateOpen(false);
    toast.success("Compte créé.");
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

  const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button><Plus className="mr-1 h-4 w-4" />Nouvel utilisateur</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Une fiche opérateur est créée automatiquement si le rôle choisi est Opérateur.
              </DialogDescription>
            </DialogHeader>
            <CreateUserForm roles={roles} onSuccess={onSuccessCreate} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {u.name} {u.id === currentUserId ? <span className="text-muted-foreground">(vous)</span> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{u.role.code}</Badge>
                  {u.operateur ? (
                    <span className="ml-1 text-xs text-muted-foreground">{u.operateur.matricule}</span>
                  ) : null}
                  {u.role.code === "SUPERVISEUR" ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {u.supervisedCount} opérateur{u.supervisedCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={u.isActive ? "default" : "destructive"}>{u.isActive ? "Actif" : "Désactivé"}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {u.lastLoginAt ? dateFmt.format(new Date(u.lastLoginAt)) : "Jamais"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Modifier" onClick={() => setEditId(u.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Réinitialiser le mot de passe" onClick={() => setResetId(u.id)}>
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editId !== null} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
            <DialogDescription>Le changement de rôle prendra effet à la prochaine connexion de l&apos;utilisateur.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <EditUserForm
              user={editing}
              roles={roles}
              operateurs={operateurs}
              onSuccess={onSuccessEdit}
              canDeactivate={editing.id !== currentUserId}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={resetId !== null} onOpenChange={(open) => !open && setResetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>Transmettez le nouveau mot de passe à l&apos;intéressé(e) par un canal sûr.</DialogDescription>
          </DialogHeader>
          {resetId !== null ? <ResetPasswordForm userId={resetId} onSuccess={onSuccessReset} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
