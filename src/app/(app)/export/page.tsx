import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { getOperateurScopeFilter } from "@/lib/services/access-scope";
import { ExportFilterForm } from "@/components/export/ExportFilterForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Export — GeoArchives-MULCV" };

export default async function ExportPage() {
  const session = await requirePermission("EXPORT_DATA");
  const isOperateurRole = session.roleCode === "OPERATEUR";
  const isSuperviseurRole = session.roleCode === "SUPERVISEUR";

  const scope = isSuperviseurRole ? await getOperateurScopeFilter(session) : undefined;
  // `scope` vaut soit `{ in: [...] }` (opérateurs affectés), soit `-1`
  // (sentinelle "aucun opérateur affecté" — jamais `undefined` ici puisque
  // getOperateurScopeFilter() n'est appelé que pour un SUPERVISEUR).
  const scopeIds = isSuperviseurRole ? (typeof scope === "object" ? scope.in : []) : undefined;

  const [communes, operateurs] = await Promise.all([
    getCommunesWithLotissements(),
    isOperateurRole ? Promise.resolve([]) : getActiveOperateurs(scopeIds),
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
              : isSuperviseurRole
                ? "L'export est limité aux dossiers des opérateurs qui vous sont affectés."
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
