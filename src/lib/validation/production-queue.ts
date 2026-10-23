import { z } from "zod";

export const productionQueueSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  carton: z.string().trim().max(500).optional(),
  statut: z.enum(["A_TRAITER", "A_CONTROLER", "TERMINE", "REJETE", "TOUS"]).default("A_TRAITER"),
  page: z.coerce.number().int().positive().default(1),
});

export type ProductionQueueSearch = z.infer<typeof productionQueueSearchSchema>;

export function parseProductionQueueSearch(raw: Record<string, string | string[] | undefined>): ProductionQueueSearch {
  const value = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, Array.isArray(item) ? item[0] : item]));
  const parsed = productionQueueSearchSchema.safeParse(value);
  return parsed.success ? parsed.data : productionQueueSearchSchema.parse({});
}
