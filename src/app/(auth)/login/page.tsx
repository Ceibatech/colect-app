import Image from "next/image";
import { redirect } from "next/navigation";
import { Archive, CheckCircle2, FileSearch, LockKeyhole, ShieldCheck } from "lucide-react";

import { getSession } from "@/lib/auth/current-user";
import { LoginForm } from "@/components/auth/LoginForm";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Connexion - GeoArchives-MULCV",
};

const capabilities = [
  {
    icon: Archive,
    title: "Chaîne d'archivage maîtrisée",
    description: "Un suivi continu, de la collecte au classement final.",
    tone: "text-[#79a8ff]",
  },
  {
    icon: FileSearch,
    title: "Dossiers immédiatement retrouvables",
    description: "Des référentiels structurés et une recherche unifiée.",
    tone: "text-[#4fd1b5]",
  },
  {
    icon: ShieldCheck,
    title: "Contrôle et traçabilité intégrés",
    description: "Des rôles précis, un audit complet et des validations suivies.",
    tone: "text-[#efc86f]",
  },
] as const;

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="grid w-full max-w-6xl overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_28px_90px_rgba(16,24,40,0.16)] lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative flex flex-col justify-between gap-10 bg-[#142943] p-6 text-white sm:p-8 lg:min-h-[660px] lg:p-10">
        <div className="absolute inset-y-0 right-0 hidden w-1 bg-brand-green lg:block" aria-hidden="true" />

        <div className="space-y-10">
          <div className="flex items-center justify-between gap-4">
            <Image
              src="/brand/ceiba-analytics-logo.png"
              alt="CEIBA Analytics"
              width={960}
              height={531}
              className="h-14 w-auto rounded-md bg-white px-3 py-2 shadow-sm"
              priority
            />
            <Badge className="rounded-md border border-white/15 bg-white/10 text-white shadow-none">
              Portail sécurisé
            </Badge>
          </div>

          <div className="max-w-xl space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4fd1b5]">MULCV &amp; CEIBA Analytics</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              GeoArchives-MULCV
            </h1>
            <p className="max-w-lg text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              Le poste de travail unifié pour inventorier, contrôler, numériser et archiver les dossiers fonciers.
            </p>
          </div>

          <div className="hidden divide-y divide-white/10 border-y border-white/10 lg:block">
            {capabilities.map(({ icon: Icon, title, description, tone }) => (
              <div key={title} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 py-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.07] ring-1 ring-white/10">
                  <Icon className={"h-4 w-4 " + tone} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/60">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#4fd1b5]" />
            Accès par rôle
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#4fd1b5]" />
            Journal d&apos;audit
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-[#4fd1b5]" />
            Données protégées
          </span>
        </div>
      </section>

      <section className="flex items-center bg-card p-6 sm:p-10 lg:p-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Espace professionnel</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">Session personnelle et sécurisée</p>
            </div>
          </div>

          <div className="mb-8 space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Connexion</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Identifiez-vous pour accéder à votre espace de travail.
            </p>
          </div>

          <LoginForm />

          <div className="mt-8 border-t border-border/70 pt-5">
            <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-brand-green" />
              GeoArchives-MULCV protège chaque opération par contrôle d&apos;accès.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
