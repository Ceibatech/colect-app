import { z } from "zod";

export const transferValidationSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  statut: z.enum(["A_VALIDER", "ATTENTE_CEIBAC", "VALIDES", "TOUS"]).default("A_VALIDER"),
  page: z.coerce.number().int().positive().max(1_000_000).default(1),
});

export type TransferValidationSearch = z.infer<typeof transferValidationSearchSchema>;

export function parseTransferValidationSearch(
  raw: Record<string, string | string[] | undefined>,
): TransferValidationSearch {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const parsed = transferValidationSearchSchema.safeParse({
    q: first(raw.q) || undefined,
    statut: first(raw.statut) || undefined,
    page: first(raw.page) || undefined,
  });
  return parsed.success ? parsed.data : transferValidationSearchSchema.parse({});
}
