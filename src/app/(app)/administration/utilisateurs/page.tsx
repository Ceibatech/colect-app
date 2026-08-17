import { requirePermission } from "@/lib/auth/current-user";
import { listUsersWithRoles, listRoles } from "@/lib/services/user-admin-service";
import { UsersManager } from "@/components/administration/UsersManager";

export const metadata = { title: "Utilisateurs — Administration" };

export default async function AdminUtilisateursPage() {
  const session = await requirePermission("USER_MANAGE");
  const [users, roles] = await Promise.all([listUsersWithRoles(), listRoles()]);

  const serialized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    role: { id: u.role.id, code: u.role.code, name: u.role.name },
    operateur: u.operateur ? { id: u.operateur.id, matricule: u.operateur.matricule, isActive: u.operateur.isActive } : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} compte{users.length > 1 ? "s" : ""}. La désactivation retire l&apos;accès sans supprimer
          l&apos;historique (§60).
        </p>
      </div>
      <UsersManager users={serialized} roles={roles} currentUserId={session.userId} />
    </div>
  );
}
