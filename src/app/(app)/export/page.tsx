import { Download, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { getOperateurScopeFilter } from "@/lib/services/access-scope";
import { ExportFilterForm } from "@/components/export/ExportFilterForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Export - GeoArchives-MULCV" };

export default async function ExportPage() {
  const session = await requirePermission("EXPORT_DATA");
  const isOperateurRole = session.roleCode === "OPERATEUR";
  const isSuperviseurRole = session.roleCode === "SUPERVISEUR";

  const scope = isSuperviseurRole ? await getOperateurScopeFilter(session) : undefined;
  const scopeIds = isSuperviseurRole ? (typeof scope === "object" ? scope.in : []) : undefined;

  const [communes, operateurs] = await Promise.all([
    getCommunesWithLotissements(),
    isOperateurRole ? Promise.resolve([]) : getActiveOperateurs(scopeIds),
  ]);

  const scopeLabel = isOperateurRole ? "Personnel" : isSuperviseurRole ? "Équipe affectée" : "Organisation";
  const scopeDescription = isOperateurRole
    ? "Vos propres dossiers"
    : isSuperviseurRole
      ? "Les opérateurs placés sous votre supervision"
      : "Tous les dossiers autorisés par votre rôle";

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Extraction contrôlée"
        icon={Download}
        title="Centre d'export"
        description="Composez une extraction précise, traçable et limitée au périmètre associé à votre rôle."
        actions={
          <Badge variant="outline" className="rounded-md bg-background/80">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-brand-green" />
            Périmètre sécurisé
          </Badge>
        }
        stats={[
          { label: "Formats disponibles", value: 2 },
          { label: "Communes accessibles", value: communes.length },
          { label: "Opérateurs", value: isOperateurRole ? "Moi" : operateurs.length },
          { label: "Périmètre", value: scopeLabel, tone: "success" },
        ]}
      />

      <ExportFilterForm
        communes={communes.map((commune) => ({ value: String(commune.id), label: commune.nom }))}
        operateurs={operateurs.map((operateur) => ({ value: String(operateur.id), label: `${operateur.nom} ${operateur.prenoms ?? ""}`.trim() }))}
        showOperateurFilter={!isOperateurRole}
        scopeLabel={scopeLabel}
        scopeDescription={scopeDescription}
      />
    </div>
  );
}