import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { requireUser } from "@/lib/auth/current-user";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoleCode } from "@/lib/permissions/constants";

export const metadata = { title: "Sécurité du compte - GeoArchives-MULCV" };

const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN: "Administrateur",
  SUPERVISEUR: "Superviseur",
  OPERATEUR: "Opérateur",
  CONSULTATION: "Consultation",
};

export default async function ComptePage() {
  const session = await requireUser();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Compte personnel"
        icon={UserRound}
        title="Sécurité du compte"
        description="Gérez vos informations de connexion dans votre espace sécurisé."
        actions={<Badge variant="outline" className="rounded-md bg-background/80">Compte actif</Badge>}
        stats={[
          { label: "Utilisateur", value: session.name },
          { label: "Rôle", value: ROLE_LABELS[session.roleCode] },
          { label: "Adresse de connexion", value: session.email },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="bg-card/95">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <KeyRound className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Changer mon mot de passe</CardTitle>
                <CardDescription className="mt-1">Confirmez votre mot de passe actuel avant d&apos;en définir un nouveau.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card className="h-fit bg-card/95">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-brand-green" />
              Bonnes pratiques
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <p>Choisissez un mot de passe unique pour GeoArchives.</p>
            <p>Ne partagez jamais vos identifiants, même avec un collègue.</p>
            <p>Déconnectez-vous après usage sur un poste partagé.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
