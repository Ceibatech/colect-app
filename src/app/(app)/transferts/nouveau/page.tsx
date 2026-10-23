import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NewTransferForm } from "@/components/transferts/NewTransferForm";
import { buttonVariants } from "@/components/ui/button";
import { getTransferCreateData } from "@/lib/services/transfer-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Nouveau lot de transfert - GeoArchives" };

export default async function NewTransferPage() {
  const data = await getTransferCreateData();

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Préparation du transfert"
        icon={PackagePlus}
        title="Identifier un lot à transférer"
        description="Sélectionnez les dossiers inventoriés au site du ministère, puis choisissez le site CEIBA qui les recevra pour traitement."
        actions={(
          <Link href="/transferts" className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft /> Retour au registre
          </Link>
        )}
        stats={[
          { label: "Dossiers en base", value: data.totalDossiers },
          { label: "Sites actifs", value: data.sites.length },
          { label: "Chaîne de garde", value: "Traçabilité active", tone: "success" },
        ]}
      />
      <NewTransferForm sites={data.sites} />
    </div>
  );
}
