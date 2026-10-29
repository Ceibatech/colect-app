import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { RepriseUpload } from "@/components/import/RepriseUpload";
import { requirePermission, requireRole } from "@/lib/auth/current-user";
import { dernierDepot } from "@/lib/services/reprise-fiches-service";

export const metadata = { title: "Reprise des fiches terrain — GeoArchives" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Abidjan" });

/**
 * Dépôt des fiches d'inventaire corrigées sur le terrain. Les fiches restent
 * sur le serveur ; la reprise (simulation, puis application après sauvegarde)
 * met à jour les dossiers existants et ajoute les nouveaux.
 */
export default async function ReprisePage() {
  await requireRole("ADMIN");
  await requirePermission("IMPORT_DATA");
  const depot = await dernierDepot();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Import de masse"
        icon={FileSpreadsheet}
        title="Reprise des fiches terrain"
        description="Déposez les fiches d'inventaire corrigées par les enquêteurs (exports Excel du formulaire). Les dossiers déjà en base sont mis à jour, les nouveaux sont ajoutés dans le carton de même libellé ; rien n'est effacé."
      />
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Déposer les fiches</h2>
        <p className="text-sm text-muted-foreground">Toutes les fiches d&apos;un même envoi ensemble (.xlsx, 12 au plus). Un nouveau dépôt remplace le précédent pour la reprise.</p>
        <RepriseUpload />
      </section>
      <section className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Dernier dépôt</h2>
        {depot ? (
          <>
            <p className="text-sm text-muted-foreground">Déposé le {dateFormat.format(depot.depose)} · {depot.fichiers.length} fiche{depot.fichiers.length > 1 ? "s" : ""}</p>
            <ul className="list-disc pl-5 text-sm">
              {depot.fichiers.map((f) => <li key={f.name}>{f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} Ko)</span></li>)}
            </ul>
            <p className="text-sm text-muted-foreground">La reprise se lance ensuite en simulation : les chiffres (mis à jour, ajoutés, inchangés) sont vérifiés avant toute écriture, puis la base est sauvegardée et la reprise appliquée.</p>
          </>
        ) : <p className="text-sm text-muted-foreground">Aucun dépôt pour le moment.</p>}
      </section>
    </div>
  );
}
