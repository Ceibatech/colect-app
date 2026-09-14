import Image from "next/image";
import { KeyRound, ShieldCheck } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Nouveau mot de passe - GeoArchives-MULCV" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4fd1b5]">Protection du compte</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Définir votre mot de passe</h1>
          <p className="mt-4 text-sm leading-6 text-white/70">
            Choisissez un mot de passe personnel pour sécuriser durablement votre accès GeoArchives.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="h-4 w-4 text-[#4fd1b5]" />
          Le lien devient inutilisable après validation
        </p>
      </section>

      <section className="flex items-center p-6 sm:p-10">
        <div className="w-full">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <KeyRound className="h-5 w-5" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">Nouveau mot de passe</h2>
          <p className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">
            Cette opération termine l&apos;activation ou la récupération de votre compte.
          </p>
          <ResetPasswordForm token={token} />
        </div>
      </section>
    </main>
  );
}
