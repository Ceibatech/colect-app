import Image from "next/image";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Mot de passe oublié - GeoArchives-MULCV" };

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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4fd1b5]">Récupération sécurisée</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Retrouver votre espace de travail</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            Recevez un lien personnel pour choisir un nouveau mot de passe sans intervention manuelle.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="h-4 w-4 text-[#4fd1b5]" />
          Lien unique · validité limitée à 60 minutes
        </p>
      </section>

      <section className="flex items-center p-6 sm:p-10">
        <div className="w-full">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <KeyRound className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Mot de passe oublié ?</h2>
          <p className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">
            Saisissez l&apos;adresse associée à votre compte. Pour préserver la confidentialité, la réponse reste identique qu&apos;un compte existe ou non.
          </p>
          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
