import { z } from "zod";

export const caisseSchema = z.object({
  numero: z.string().trim().min(1, "Saisissez le numéro de la caisse.").max(40),
  description: z.string().trim().max(255).optional().nullable(),
  capacite: z.coerce.number().int().min(1).max(500).optional(),
  siteId: z.coerce.number().int().positive("Choisissez le site CEIBA."),
  isActive: z.boolean().optional(),
});
