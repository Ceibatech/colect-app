import { requirePermission } from "@/lib/auth/current-user";
import { listAllTypesPiece } from "@/lib/services/referentiels-admin-service";
import { TypesPieceManager } from "@/components/administration/TypesPieceManager";

export const metadata = { title: "Types de pièces — Administration" };

export default async function AdminTypesPiecePage() {
  await requirePermission("REFERENTIEL_MANAGE");
  const typesPiece = await listAllTypesPiece();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Types de pièces</h1>
        <p className="text-sm text-muted-foreground">
          {typesPiece.length} type{typesPiece.length > 1 ? "s" : ""} de pièce (CNI, Carte résident, Extrait topo...) proposé(s) en étape
          « Dossier » de la Collecte.
        </p>
      </div>
      <TypesPieceManager typesPiece={typesPiece} />
    </div>
  );
}
