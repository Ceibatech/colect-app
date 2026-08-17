import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, Info } from "lucide-react";

export const metadata = { title: "Rôles — Administration" };

/**
 * Vue en lecture seule de la matrice rôles × permissions (Phase 15+).
 * Volontairement non éditable ici : modifier `role_permissions` en direct
 * risquerait de retirer par erreur une permission à son propre compte (y
 * compris ADMIN) et de se retrouver bloqué hors de l'application — le seul
 * mécanisme sûr en V1 reste la source canonique
 * `src/lib/permissions/constants.ts` (utilisée par `prisma/seed-production-core.ts`)
 * plus une revue humaine avant tout re-seed. Édition en ligne à envisager
 * plus tard avec un garde-fou explicite (ex. empêcher de retirer sa propre
 * permission ROLE_MANAGE).
 */
export default async function AdminRolesPage() {
  await requirePermission("ROLE_MANAGE");

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: "asc" }, include: { rolePermissions: true } }),
    prisma.permission.findMany({ orderBy: { code: "asc" } }),
  ]);

  const hasPermission = (roleId: number, permissionId: number) =>
    roles.find((r) => r.id === roleId)?.rolePermissions.some((rp) => rp.permissionId === permissionId) ?? false;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rôles &amp; permissions</h1>
        <p className="text-sm text-muted-foreground">{roles.length} rôles, {permissions.length} permissions.</p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Lecture seule</AlertTitle>
        <AlertDescription>
          Matrice reflétant l&apos;état réel en base (utilisée pour chaque nouvelle connexion). Sa modification n&apos;est
          pas proposée ici pour éviter de se retrouver bloqué hors de l&apos;application par erreur — contactez l&apos;équipe
          technique pour un changement de la matrice de permissions.
        </AlertDescription>
      </Alert>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              {roles.map((r) => (
                <TableHead key={r.id} className="text-center">
                  <Badge variant="secondary">{r.code}</Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap">{p.code}</TableCell>
                {roles.map((r) => (
                  <TableCell key={r.id} className="text-center">
                    {hasPermission(r.id, p.id) ? <Check className="mx-auto h-4 w-4 text-primary" /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
