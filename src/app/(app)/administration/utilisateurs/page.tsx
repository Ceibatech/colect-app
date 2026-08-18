import { requirePermission } from "@/lib/auth/current-user";
import { listUsersWithRoles, listRoles, listActiveOperateursForAssignment } from "@/lib/services/user-admin-service";
import { UsersManager } from "@/components/administration/UsersManager";

export const metadata = { title: "Utilisateurs — Administration" };

export default async function AdminUtilisateursPage() {
  const session = await requirePermission("USER_MANAGE");
  const [users, roles, operateurs] = await Promise.all([
    listUsersWithRoles(),
    listRoles(),
    listActiveOperateursForAssignment(),
  ]);

  const serialized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    role: { id: u.role.id, code: u.role.code, name: u.role.name },
    operateur: u.operateur ? { id: u.operateur.id, matricule: u.operateur.matricule, isActive: u.operateur.isActive } : null,
    supervisedCount: u._count.supervisedOperateurs,
  }));

  const serializedOperateurs = operateurs.map((o) => ({
    id: o.id,
    matricule: o.matricule,
    nom: o.nom,
    prenoms: o.prenoms,
    supervisorId: o.supervisorId,
    supervisorName: o.supervisor?.name ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} compte{users.length > 1 ? "s" : ""}. La désactivation retire l&apos;accès sans supprimer
          l&apos;historique (§60). L&apos;affectation d&apos;opérateurs à un superviseur (rôle Superviseur) détermine
          les dossiers qu&apos;il peut consulter et valider.
        </p>
      </div>
      <UsersManager users={serialized} roles={roles} operateurs={serializedOperateurs} currentUserId={session.userId} />
    </div>
  );
}
