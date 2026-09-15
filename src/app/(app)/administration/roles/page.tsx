import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, Info, Shield } from "lucide-react";

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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sécurité"
        icon={Shield}
        title="Rôles & permissions"
        description="Matrice en lecture seule des rôles et permissions appliquées à chaque nouvelle connexion."
        stats={[
          { label: "Rôles", value: roles.length },
          { label: "Permissions", value: permissions.length },
          { label: "Mode", value: "Lecture seule" },
        ]}
      />

      <Alert className="border-primary/20 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle>Lecture seule</AlertTitle>
        <AlertDescription>
          Cette matrice reflète l&apos;état réel en base. Sa modification n&apos;est pas proposée ici afin d&apos;éviter le retrait accidentel d&apos;accès critiques.
        </AlertDescription>
      </Alert>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card/95 shadow-sm">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>Permission</TableHead>
              {roles.map((r) => (
                <TableHead key={r.id} className="text-center">
                  <Badge variant="secondary" className="rounded-md">{r.code}</Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((p) => (
              <TableRow key={p.id} className="hover:bg-accent/30">
                <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">{p.code}</TableCell>
                {roles.map((r) => (
                  <TableCell key={r.id} className="text-center">
                    {hasPermission(r.id, p.id) ? <Check className="mx-auto h-4 w-4 text-brand-green" /> : <span className="text-muted-foreground">—</span>}
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
