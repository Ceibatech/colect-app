import { redirect } from "next/navigation";
import Image from "next/image";
import { Archive, FileSearch, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/current-user";
import { LoginForm } from "@/components/auth/LoginForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Connexion — GeoArchives-MULCV",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="grid w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative overflow-hidden rounded-lg border border-border/70 bg-card/90 p-6 shadow-[0_24px_80px_rgba(16,24,40,0.10)] sm:p-8 lg:min-h-[620px]">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-brand-green to-brand-gold" />
        <div className="flex h-full flex-col justify-between gap-12">
          <div className="space-y-8">
            <Image
              src="/brand/ceiba-analytics-logo.png"
              alt="CEIBA Analytics"
              width={960}
              height={531}
              className="h-16 w-auto rounded-md bg-white px-3 py-2 shadow-sm"
              priority
            />

            <div className="max-w-2xl space-y-4">
              <Badge variant="secondary" className="rounded-md border border-border/60 bg-muted/70 uppercase tracking-[0.18em]">
                MULCV &amp; CEIBA
              </Badge>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  GeoArchives-MULCV
                </h1>
                <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Préserver aujourd&apos;hui, valoriser demain : une plateforme claire pour suivre la collecte,
                  la numérisation, l&apos;indexation et l&apos;archivage des dossiers fonciers.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <Archive className="mb-3 h-5 w-5 text-primary" />
              <div className="text-sm font-semibold">Archivage maîtrisé</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Pipeline complet et traçable.</div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <FileSearch className="mb-3 h-5 w-5 text-brand-green" />
              <div className="text-sm font-semibold">Dossiers retrouvables</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Recherche et référentiels unifiés.</div>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <ShieldCheck className="mb-3 h-5 w-5 text-brand-gold" />
              <div className="text-sm font-semibold">Accès contrôlé</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Rôles, audit et qualité intégrés.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex justify-center lg:justify-end">
        <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-[0_24px_80px_rgba(16,24,40,0.14)]">
          <CardHeader className="space-y-2 pb-2 text-center">
            <CardTitle className="text-2xl font-semibold tracking-tight">Connexion</CardTitle>
            <CardDescription>Accédez à votre espace de travail sécurisé.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LoginForm />
            <p className="text-center text-xs leading-5 text-muted-foreground">
              GeoArchives-MULCV — Inventaire · Numérisation · Indexation · Archivage
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}