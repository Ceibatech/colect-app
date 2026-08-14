import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { ExportFilterForm } from "@/components/export/ExportFilterForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Export — GeoArchives-MULCV" };

export default async function ExportPage() {
  const session = await requirePermission("EXPORT_DATA");
  const isOperateurRole = session.roleCode === "OPERATEUR";

  const [communes, operateurs] = await Promise.all([
    getCommunesWithLotissements(),
    isOperateurRole ? Promise.resolve([]) : getActiveOperateurs(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Export</h1>
        <p className="text-sm text-muted-foreground">Export CSV ou Excel respectant les filtres actifs (§55).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtres d&apos;export</CardTitle>
          <CardDescription>
            {isOperateurRole
              ? "L'export est limité à vos propres dossiers."
              : "Laissez un filtre vide pour inclure tous les dossiers."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportFilterForm
            communes={communes.map((c) => ({ value: String(c.id), label: c.nom }))}
            operateurs={operateurs.map((o) => ({ value: String(o.id), label: `${o.nom} ${o.prenoms ?? ""}` }))}
            showOperateurFilter={!isOperateurRole}
          />
        </CardContent>
      </Card>
    </div>
  );
}
