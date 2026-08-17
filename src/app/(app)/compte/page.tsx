import { requireUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
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
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Mon compte</h1>
        <p className="text-sm text-muted-foreground">{session.name} — {session.email}</p>
      </div>

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
