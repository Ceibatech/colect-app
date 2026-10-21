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
        description="Recherchez les cartons déjà inventoriés dans GeoArchives. Tous les dossiers du carton sont rattachés automatiquement et la composition est figée avant la sortie."
        actions={(
          <Link href="/transferts" className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft /> Retour au registre
          </Link>
        )}
        stats={[
          { label: "Cartons disponibles", value: data.cartons.length },
          { label: "Sites actifs", value: data.sites.length },
          { label: "Contrôle préalable", value: "Préparation terminée", tone: "success" },
        ]}
      />
      <NewTransferForm sites={data.sites} cartons={data.cartons} />
    </div>
  );
}
