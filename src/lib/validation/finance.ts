import { z } from "zod";

const pointValue = z.coerce
  .number({ message: "Saisissez un montant valide." })
  .finite("Saisissez un montant valide.")
  .min(0, "Le montant ne peut pas être négatif.")
  .max(100_000_000, "Le montant dépasse la limite autorisée.");

export const financeRateSchema = z.object({
  operatorPointValue: pointValue,
  supervisorPointValue: pointValue,
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "La devise doit contenir 3 lettres (ex. XOF).")),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "La date d'effet est invalide.")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "La date d'effet est invalide."),
});

export type FinanceRateInput = z.infer<typeof financeRateSchema>;