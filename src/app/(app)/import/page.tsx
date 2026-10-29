import { Upload } from "lucide-react";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/current-user";
import { buttonVariants } from "@/components/ui/button";
import { ImportWizard } from "@/components/import/ImportWizard";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Import — GeoArchives" };

export default async function ImportPage() {
  const session = await requirePermission("IMPORT_DATA");

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
        actions={session.roleCode === "ADMIN" ? <Link href="/import/reprise" className={buttonVariants({ variant: "outline" })}>Reprise des fiches terrain</Link> : undefined}
      />
      <ImportWizard />
    </div>
  );
}