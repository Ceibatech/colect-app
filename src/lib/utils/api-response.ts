import { NextResponse } from "next/server";
import { ApiError } from "@/lib/utils/api-error";

/**
 * Traduit une erreur en réponse JSON. Les `ApiError` (précondition métier,
 * permission, 404) exposent leur message tel quel — ce sont des messages
 * volontairement écrits pour l'utilisateur. Toute autre erreur reste
 * générique : jamais de stack trace ni de détail interne en production
 * (cahier des charges §67).
 */
export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Une erreur interne est survenue." }, { status: 500 });
}

export function parseIdParam(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError("Identifiant de dossier invalide.", 400);
  }
  return n;
}
