import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Accès oublié - GeoArchives-MULCV" };

export default function ForgotPasswordPage() {
  return (
    <main className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_28px_90px_rgba(16,24,40,0.16)] lg:grid-cols-[0.82fr_1.18fr]">
      <section className="flex flex-col justify-between gap-8 bg-[#142943] p-6 text-white sm:p-8">
        <Image
          src="/brand/ceiba-analytics-logo.png"
          alt="CEIBA Analytics"
          width={960}
          height={531}
          className="h-12 w-auto self-start rounded-md bg-white px-3 py-2 shadow-sm"
          priority
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4fd1b5]">Assistance d&apos;accès</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Retrouver votre espace de travail</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            La récupération est contrôlée afin de protéger les dossiers et la traçabilité des opérations.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="h-4 w-4 text-[#4fd1b5]" />
          Réinitialisation validée par un administrateur habilité
        </p>
      </section>

      <section className="flex items-center p-6 sm:p-10">
        <div className="w-full">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <KeyRound className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Mot de passe oublié ?</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Contactez votre administrateur GeoArchives avec votre adresse e-mail professionnelle. Après vérification de votre identité, il pourra générer un mot de passe temporaire depuis la gestion des utilisateurs.
          </p>

          <div className="mt-6 flex items-start gap-3 rounded-lg border border-border/70 bg-muted/35 p-4">
            <UserCog className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Pour votre sécurité</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Aucun mot de passe n&apos;est envoyé ni affiché sans contrôle préalable de l&apos;administrateur.
              </p>
            </div>
          </div>

          <Link href="/login" className={cn(buttonVariants(), "mt-7 h-11")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la connexion
          </Link>
        </div>
      </section>
    </main>
  );
}
