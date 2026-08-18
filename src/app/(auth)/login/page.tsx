import { redirect } from "next/navigation";
import Image from "next/image";
import { getSession } from "@/lib/auth/current-user";
import { LoginForm } from "@/components/auth/LoginForm";
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
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <Image
          src="/brand/ceiba-analytics-logo.png"
          alt="CEIBA Analytics"
          width={960}
          height={531}
          className="mx-auto h-14 w-auto"
          priority
        />
        <p className="mt-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          MULCV &amp; CEIBA*
        </p>
        <p className="mt-1 text-base font-semibold text-primary">Préserver aujourd&apos;hui, valoriser demain.</p>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Inventaire · Numérisation · Indexation · Archivage
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center text-xl">GeoArchives-MULCV</CardTitle>
          <CardDescription className="text-center">Connectez-vous pour continuer.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
