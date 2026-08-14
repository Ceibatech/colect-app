import { redirect } from "next/navigation";
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
        <CardTitle className="text-xl">GeoArchives-MULCV</CardTitle>
        <CardDescription>Numérisation &amp; Indexation — connectez-vous pour continuer.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
