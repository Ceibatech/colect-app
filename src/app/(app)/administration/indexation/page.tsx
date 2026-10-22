import { ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { IndexingFieldsManager } from "@/components/administration/IndexingFieldsManager";
import { listIndexingFieldsForAdmin } from "@/lib/services/indexing-config-service";

export const metadata = { title: "Champs d'indexation - Administration" };

export default async function IndexingConfigurationPage() {
  const fields = await listIndexingFieldsForAdmin();
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Indexation documentaire"
        icon={ScanSearch}
        title="Champs de recherche"
        description="Définissez les informations que le moteur doit reconnaître dans les scans et rendre disponibles à la recherche."
        stats={[
          { label: "Champs", value: fields.length },
          { label: "Actifs", value: fields.filter((field) => field.isActive).length, tone: "success" },
          { label: "Obligatoires", value: fields.filter((field) => field.isRequired).length },
        ]}
      />
      <IndexingFieldsManager fields={fields.map((field) => ({
        ...field,
        aliases: Array.isArray(field.aliases) ? field.aliases.filter((value): value is string => typeof value === "string") : [],
      }))} />
    </div>
  );
}
