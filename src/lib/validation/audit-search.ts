import { z } from "zod";

export const auditSearchParamsSchema = z.object({
  user: z.coerce.number().int().positive().optional(),
  action: z.string().max(100).optional(),
  entity: z.string().max(100).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
});

export type AuditSearchParams = z.infer<typeof auditSearchParamsSchema>;

export function parseAuditSearchParams(raw: Record<string, string | string[] | undefined>): AuditSearchParams {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    const single = Array.isArray(value) ? value[0] : value;
    // Un <select> non renseigné ("Tous") soumet une chaîne vide, pas une
    // absence de paramètre — sans cette normalisation, `z.coerce.number()`
    // échoue sur "", ce qui fait échouer tout le schéma (safeParse) et
    // annule au passage les AUTRES filtres pourtant valides (même bug que
    // dossier-search.ts).
    flat[key] = single === "" ? undefined : single;
  }
  const parsed = auditSearchParamsSchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  return auditSearchParamsSchema.parse({});
}
