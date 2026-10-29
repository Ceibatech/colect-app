import { TransferValidationWorkspace } from "@/components/transferts/TransferValidationWorkspace";
import { getCeibacTransferValidationWorkspace } from "@/lib/services/transfer-validation-service";
import { parseTransferValidationSearch } from "@/lib/validation/transfer-validation-search";

export const metadata = { title: "Validation - GeoArchives" };

export default async function CeibacTransferValidationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseTransferValidationSearch(await searchParams);
  const data = await getCeibacTransferValidationWorkspace(filters);
  return <TransferValidationWorkspace data={data} filters={filters} stage="CEIBA" />;
}
