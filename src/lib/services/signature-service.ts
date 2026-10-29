"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";

export type SignatureState = { error?: string; success?: boolean; message?: string };

const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Enregistre la signature dessinée par l'utilisateur, pour l'apposer ensuite d'un appui. */
export async function saveMySignature(_previous: SignatureState, formData: FormData): Promise<SignatureState> {
  const session = await requireUser();
  const value = String(formData.get("signature") ?? "");
  if (value.length < 100) return { error: "Dessinez votre signature dans le cadre." };
  if (value.length > 500_000 || !SIGNATURE.test(value)) return { error: "Le format de signature est invalide." };
  await prisma.user.update({ where: { id: session.userId }, data: { signatureData: value } });
  revalidatePath("/", "layout");
  return { success: true, message: "Signature enregistrée : elle sera apposée d'office sur vos bordereaux." };
}

export async function deleteMySignature(): Promise<SignatureState> {
  const session = await requireUser();
  await prisma.user.update({ where: { id: session.userId }, data: { signatureData: null } });
  revalidatePath("/", "layout");
  return { success: true, message: "Signature enregistrée supprimée." };
}
