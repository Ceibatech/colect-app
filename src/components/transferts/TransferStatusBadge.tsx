import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getTransferItemStatusLabel,
  getTransferLotStatusLabel,
  type TransferItemStatusCode,
  type TransferLotStatusCode,
} from "@/lib/utils/transfer-stock";

const lotTone: Record<TransferLotStatusCode, string> = {
  BROUILLON: "border-border bg-muted/60 text-muted-foreground",
  AUTORISE: "border-primary/25 bg-primary/10 text-primary",
  PARTIELLEMENT_SORTI: "border-brand-gold/30 bg-brand-gold/10 text-brand-gold",
  EN_TRANSIT: "border-brand-gold/30 bg-brand-gold/10 text-brand-gold",
  RECU_PARTIEL: "border-brand-green/25 bg-brand-green/10 text-brand-green",
  CHEZ_CEIBAC: "border-brand-green/25 bg-brand-green/10 text-brand-green",
  RETOUR_PARTIEL: "border-primary/25 bg-primary/10 text-primary",
  CLOTURE: "border-brand-green/25 bg-brand-green/10 text-brand-green",
  ANNULE: "border-destructive/25 bg-destructive/10 text-destructive",
};

const itemTone: Record<TransferItemStatusCode, string> = {
  PREVU: "border-border bg-muted/60 text-muted-foreground",
  SORTI: "border-brand-gold/30 bg-brand-gold/10 text-brand-gold",
  RECU: "border-brand-green/25 bg-brand-green/10 text-brand-green",
  RETOURNE: "border-primary/25 bg-primary/10 text-primary",
};

export function TransferLotStatusBadge({ status }: { status: TransferLotStatusCode }) {
  return (
    <Badge variant="outline" className={cn("rounded-md", lotTone[status])}>
      {getTransferLotStatusLabel(status)}
    </Badge>
  );
}

export function TransferItemStatusBadge({ status }: { status: TransferItemStatusCode }) {
  return (
    <Badge variant="outline" className={cn("rounded-md", itemTone[status])}>
      {getTransferItemStatusLabel(status)}
    </Badge>
  );
}
