import { Upload } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { ImportWizard } from "@/components/import/ImportWizard";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Import — GeoArchives-MULCV" };

export default async function ImportPage() {
  await requirePermission("IMPORT_DATA");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Import de masse"
        icon={Upload}
        title="Import Excel / CSV"
        description="Chargez un fichier, prévisualisez les lignes, détectez les doublons, puis confirmez la création des brouillons."
        stats={[
          { label: "Formats", value: ".csv / .xlsx" },
          { label: "Taille max", value: "5 Mo" },
          { label: "Mode", value: "Brouillons" },
        ]}
      />
      <ImportWizard />
    </div>
  );
}