"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TypesPiecesField, type TypePieceOption } from "./TypesPiecesField";

export interface PreparationPieceLineInput {
  typePiece: string;
  nombrePieces: number;
  nombrePages: number;
}

export function PreparationPieceBreakdownField({
  value,
  onChange,
  typesPiece,
}: {
  value: PreparationPieceLineInput[];
  onChange: (value: PreparationPieceLineInput[]) => void;
  typesPiece: TypePieceOption[];
}) {
  const selectedTypes = value.map((line) => line.typePiece);
  const totalPieces = value.reduce((sum, line) => sum + Math.max(0, line.nombrePieces), 0);
  const totalPages = value.reduce((sum, line) => sum + Math.max(0, line.nombrePages), 0);
  const complete = value.length > 0 && value.every(
    (line) => line.nombrePieces > 0 && line.nombrePages >= line.nombrePieces,
  );

  function syncSelectedTypes(tokens: string[]) {
    onChange(tokens.map((token) => (
      value.find((line) => line.typePiece === token) ?? {
        typePiece: token,
        nombrePieces: 0,
        nombrePages: 0,
      }
    )));
  }

  function updateLine(token: string, field: "nombrePieces" | "nombrePages", rawValue: string) {
    const parsed = rawValue === "" ? 0 : Number(rawValue);
    onChange(value.map((line) => (
      line.typePiece === token
        ? { ...line, [field]: Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0 }
        : line
    )));
  }

  function getLabel(token: string) {
    if (token.startsWith("new:")) return token.slice(4);
    return typesPiece.find((type) => String(type.id) === token)?.libelle ?? "Type de pièce";
  }

  return (
    <div className="space-y-3">
      <TypesPiecesField value={selectedTypes} onChange={syncSelectedTypes} typesPiece={typesPiece} />

      {value.length > 0 ? (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] gap-2 bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
            <span>Type de pièce</span>
            <span className="text-center">Pièces</span>
            <span className="text-center">Pages</span>
          </div>
          {value.map((line) => {
            const lineValid = line.nombrePieces > 0 && line.nombrePages >= line.nombrePieces;
            const label = getLabel(line.typePiece);
            return (
              <div
                key={line.typePiece}
                className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2 border-t px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  {!lineValid && line.nombrePieces > 0 && line.nombrePages > 0 ? (
                    <p className="text-xs text-destructive">Pages inférieures aux pièces</p>
                  ) : null}
                </div>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={line.nombrePieces || ""}
                  onChange={(event) => updateLine(line.typePiece, "nombrePieces", event.target.value)}
                  aria-label={`Nombre de pièces pour ${label}`}
                  className="h-9 text-center tabular-nums"
                />
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={line.nombrePages || ""}
                  onChange={(event) => updateLine(line.typePiece, "nombrePages", event.target.value)}
                  aria-label={`Nombre de pages pour ${label}`}
                  className="h-9 text-center tabular-nums"
                />
              </div>
            );
          })}
          <div className="grid grid-cols-[minmax(0,1fr)_88px_88px] items-center gap-2 border-t bg-muted/35 px-3 py-2.5 text-sm font-semibold">
            <span>Total calculé</span>
            <span className="text-center tabular-nums">{totalPieces}</span>
            <span className="text-center tabular-nums">{totalPages}</span>
          </div>
        </div>
      ) : null}

      <div className={`flex items-start gap-2 text-xs ${complete ? "text-emerald-700" : "text-muted-foreground"}`}>
        {complete ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <p>
          {complete
            ? `Contrôle cohérent : ${totalPieces} pièce${totalPieces > 1 ? "s" : ""} et ${totalPages} page${totalPages > 1 ? "s" : ""}.`
            : "Renseignez au moins une pièce et ses pages pour chaque type sélectionné."}
        </p>
      </div>
    </div>
  );
}
