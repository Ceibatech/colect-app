import { z } from "zod";
import { TRANSFER_MOVEMENT_TYPES } from "@/lib/utils/transfer-stock";

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === "none" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const optionalDateTime = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "La date est invalide.").optional(),
);

const signatureData = z
  .string()
  .min(100, "La signature dessinée est requise.")
  .max(500_000, "La signature est trop volumineuse.")
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Le format de signature est invalide.");

const optionalSignature = z.preprocess((value) => value === "" || value === null ? undefined : value, signatureData.optional());
const optionalShortText = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.string().trim().min(2).max(120).optional(),
);

export const createTransferLotSchema = z.object({
  sourceSiteId: z.coerce.number().int().positive("Le site de départ est requis."),
  sourceEntrepotId: optionalPositiveInt,
  destinationSiteId: z.coerce.number().int().positive("Le site de destination est requis."),
  destinationEntrepotId: optionalPositiveInt,
  includeUnlocated: z.preprocess((value) => value === "true" || value === "1" || value === "on", z.boolean()),
  plannedAt: optionalDateTime,
  motif: z.string().trim().max(2_000, "Le motif est trop long.").optional().or(z.literal("")),
  dossierIds: z.array(z.coerce.number().int().positive()).min(1, "Sélectionnez au moins un dossier.").max(500, "Un lot peut contenir au maximum 500 dossiers."),
});

export const authorizeTransferLotSchema = z.object({
  signatoryName: z.string().trim().min(2, "Le nom du responsable ministériel est requis.").max(120),
  signatoryTitle: z.string().trim().min(2, "La fonction du responsable ministériel est requise.").max(120),
  signature: signatureData,
});

export const transferApprovalSchema = z.object({
  signatoryName: z.string().trim().min(2, "Le nom du signataire est requis.").max(120),
  signatoryTitle: z.string().trim().min(2, "La fonction du signataire est requise.").max(120),
  signature: signatureData,
});

export const transferTrackingPointSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().nonnegative().max(100_000).optional(),
  speed: z.coerce.number().nonnegative().max(200).optional(),
  heading: z.coerce.number().min(0).max(360).optional(),
  capturedAt: z.string().datetime(),
});

export const recordTransferMovementSchema = z.object({
  type: z.enum(TRANSFER_MOVEMENT_TYPES),
  itemIds: z.array(z.coerce.number().int().positive()).min(1, "Sélectionnez au moins un groupe de dossiers.").max(500),
  occurredAt: z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), "La date du mouvement est invalide."),
  observations: z.string().trim().max(2_000, "Les observations sont trop longues.").optional().or(z.literal("")),
  conditionStatus: z.enum(["CONFORME", "AVEC_RESERVES", "NON_CONFORME"]).optional(),
  ministryName: optionalShortText,
  ministryTitle: optionalShortText,
  ministrySignature: optionalSignature,
  ceibacName: z.string().trim().min(2, "Le nom du signataire CEIBA est requis.").max(120),
  ceibacTitle: z.string().trim().min(2, "La fonction du signataire CEIBA est requise.").max(120),
  ceibacSignature: signatureData,
}).superRefine((value, context) => {
  if (value.type === "RECEPTION") {
    if (!value.conditionStatus) context.addIssue({ code: "custom", path: ["conditionStatus"], message: "L'état du chargement à l'arrivée est requis." });
    if (value.conditionStatus !== "CONFORME" && !value.observations) {
      context.addIssue({ code: "custom", path: ["observations"], message: "Décrivez les réserves ou la non-conformité constatée." });
    }
  }
});

export type CreateTransferLotInput = z.infer<typeof createTransferLotSchema>;
export type RecordTransferMovementInput = z.infer<typeof recordTransferMovementSchema>;
