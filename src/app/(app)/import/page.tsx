import { requirePermission } from "@/lib/auth/current-user";
import { ImportWizard } from "@/components/import/ImportWizard";

export const metadata = { title: "Import — GeoArchives-MULCV" };

export default async function ImportPage() {
  await requirePermission("IMPORT_DATA");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Import Excel / CSV</h1>
        <p className="text-sm text-muted-foreground">
          Upload → lecture → prévisualisation → validation → détection des doublons → confirmation.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
