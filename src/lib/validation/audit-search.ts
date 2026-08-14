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
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = auditSearchParamsSchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  return auditSearchParamsSchema.parse({});
}
