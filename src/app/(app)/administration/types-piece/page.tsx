import { FileStack } from "lucide-react";
import { requirePermission } from "@/lib/auth/current-user";
import { listAllTypesPiece } from "@/lib/services/referentiels-admin-service";
import { TypesPieceManager } from "@/components/administration/TypesPieceManager";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata = { title: "Types de pièces — Administration" };

export default async function AdminTypesPiecePage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const typesPiece = await listAllTypesPiece();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Référentiel"
        icon={FileStack}
        title="Types de pièces"
        description={`${typesPiece.length} type${typesPiece.length > 1 ? "s" : ""} de pièce proposé${typesPiece.length > 1 ? "s" : ""} en étape Dossier de la Collecte.`}
        stats={[
          { label: "Total", value: typesPiece.length },
          { label: "Actifs", value: typesPiece.filter((t) => t.isActive).length, tone: "success" },
        ]}
      />
      <TypesPieceManager typesPiece={typesPiece} />
    </div>
  );
}