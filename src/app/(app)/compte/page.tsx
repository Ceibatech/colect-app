import { User } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Mon compte — GeoArchives-MULCV" };

/**
 * Page self-service (Phase 15) — accessible à tout utilisateur connecté,
 * volontairement protégée uniquement par `requireUser()` (pas de permission
 * dédiée : changer SON PROPRE mot de passe n'est pas une action
 * administrative sur un tiers, cf. `USER_MANAGE` réservé à ADMIN).
 */
export default async function ComptePage() {
  const session = await requireUser();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Profil"
        icon={User}
        title="Mon compte"
        description={`${session.name} — ${session.email}`}
        stats={[
          { label: "Rôle", value: session.roleCode },
          { label: "Sécurité", value: "Mot de passe" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Changer mon mot de passe</CardTitle>
          <CardDescription>Le mot de passe actuel est requis pour confirmer le changement.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}