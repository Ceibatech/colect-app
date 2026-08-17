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
    <Card className="w-full max-w-sm">
      <CardHeader>
        <Image
          src="/brand/ceiba-analytics-logo.png"
          alt="CEIBA Analytics"
          width={960}
          height={531}
          className="mx-auto mb-2 h-14 w-auto"
          priority
        />
        <CardTitle className="text-center text-xl">GeoArchives-MULCV</CardTitle>
        <CardDescription className="text-center">
          Numérisation &amp; Indexation — connectez-vous pour continuer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
