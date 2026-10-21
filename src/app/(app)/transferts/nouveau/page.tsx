import Link from "next/link";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NewTransferForm } from "@/components/transferts/NewTransferForm";
import { buttonVariants } from "@/components/ui/button";
import { getTransferCreateData } from "@/lib/services/transfer-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Nouveau lot de transfert - GeoArchives-MULCV" };

export default async function NewTransferPage() {
  const data = await getTransferCreateData();

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Préparation du transfert"
        icon={PackagePlus}
        title="Identifier un lot à transférer"
        description="Sélectionnez les dossiers présents au site A. Leur composition est figée dans le lot avant validation, sortie et réception au site B."
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
