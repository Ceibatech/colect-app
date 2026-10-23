import { TransferValidationWorkspace } from "@/components/transferts/TransferValidationWorkspace";
import { getTransferValidationWorkspace } from "@/lib/services/transfer-validation-service";
import { parseTransferValidationSearch } from "@/lib/validation/transfer-validation-search";

export const metadata = { title: "Validation SDA - GeoArchives" };

export default async function MinistryTransferValidationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseTransferValidationSearch(await searchParams);
  const data = await getTransferValidationWorkspace(filters);
  return <TransferValidationWorkspace data={data} filters={filters} stage="MINISTERE" />;
}
