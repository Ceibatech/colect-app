import { requirePermission } from "@/lib/auth/current-user";
import { getCommunesWithLotissements, getNaturesDossier, getActiveOperateurs } from "@/lib/services/referentiels-service";
import { CollecteWizard } from "@/components/collecte/CollecteWizard";

export const metadata = { title: "Nouveau dossier — Collecte" };

// Permet de démarrer un nouveau dossier même lorsque des brouillons existent
// déjà (la page /collecte affiche alors la liste de reprise en priorité).
export default async function CollecteNouveauPage() {
  const session = await requirePermission("DOSSIER_CREATE");
  const isOperateurRole = session.roleCode === "OPERATEUR";

  const [communes, natures, operateurs] = await Promise.all([
    getCommunesWithLotissements(),
    getNaturesDossier(),
    isOperateurRole ? Promise.resolve([]) : getActiveOperateurs(),
  ]);

  return (
    <CollecteWizard
      communes={communes}
      natures={natures}
      operateurs={operateurs}
      isOperateurRole={isOperateurRole}
      currentUserName={session.name}
    />
  );
}
