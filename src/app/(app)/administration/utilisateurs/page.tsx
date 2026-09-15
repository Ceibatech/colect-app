import { Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listUsersWithRoles, listRoles, listActiveOperateursForAssignment, listActiveSupervisorsForPmoAssignment } from "@/lib/services/user-admin-service";
import { UsersManager } from "@/components/administration/UsersManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Utilisateurs — Administration" };

export default async function AdminUtilisateursPage() {
  const session = await requirePermission("USER_MANAGE");
  const [users, roles, operateurs, supervisors] = await Promise.all([
    listUsersWithRoles(),
    listRoles(),
    listActiveOperateursForAssignment(),
    listActiveSupervisorsForPmoAssignment(),
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
    pmoSupervisorIds: u.pmoSupervisorScopes.map((scope) => scope.supervisorUserId),
  }));

  const serializedOperateurs = operateurs.map((o) => ({
    id: o.id,
    matricule: o.matricule,
    nom: o.nom,
    prenoms: o.prenoms,
    supervisorId: o.supervisorId,
    supervisorName: o.supervisor?.name ?? null,
  }));

  const serializedSupervisors = supervisors.map((supervisor) => ({
    id: supervisor.id,
    name: supervisor.name,
    email: supervisor.email,
    operatorCount: supervisor._count.supervisedOperateurs,
  }));
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sécurité"
        icon={Users}
        title="Utilisateurs"
        description={`${users.length} compte${users.length > 1 ? "s" : ""}. La désactivation retire l'accès sans supprimer l'historique.`}
        stats={[
          { label: "Comptes", value: users.length },
          { label: "Actifs", value: users.filter((u) => u.isActive).length, tone: "success" },
          { label: "Rôles", value: roles.length },
          { label: "Opérateurs", value: operateurs.length },
        ]}
      />
      <UsersManager users={serialized} roles={roles} operateurs={serializedOperateurs} supervisors={serializedSupervisors} currentUserId={session.userId} />
    </div>
  );
}
