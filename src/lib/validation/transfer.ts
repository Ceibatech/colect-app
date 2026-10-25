import { z } from "zod";
import { TRANSFER_MOVEMENT_TYPES } from "@/lib/utils/transfer-stock";

const optionalPositiveInt = z.preprocess(
  (value) => (value === "" || value === "none" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const requiredDateTime = z.string({ message: "La date de transfert est requise." })
  .min(1, "La date de transfert est requise.")
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "La date est invalide.");

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
const optionalLongText = z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.string().trim().min(2).max(2_000).optional(),
);
const optionalChoiceDetail = z.preprocess(
  (value) => value === null ? undefined : value,
  z.string().trim().max(300, "La précision « Autre » est trop longue.").optional(),
);
const participantIds = (message: string) => z.array(z.coerce.number().int().positive()).min(1, message).max(30, "Trop d'intervenants sélectionnés.");
const choiceList = (message: string) => z.array(z.string().trim().min(1).max(40)).min(1, message).max(20);
const requiredPlanningText = (label: string, max = 2_000) => z.string().trim().min(2, `${label} est requis.`).max(max, `${label} est trop long.`);

export const createTransferLotSchema = z.object({
  sourceSiteId: z.coerce.number().int().positive("Le site de départ est requis."),
  sourceEntrepotId: optionalPositiveInt,
  destinationSiteId: z.coerce.number().int().positive("Le site de destination est requis."),
  destinationEntrepotId: optionalPositiveInt,
  includeUnlocated: z.preprocess((value) => value === "true" || value === "1" || value === "on", z.boolean()),
  plannedAt: requiredDateTime,
  archiveSupport: z.enum(["PHYSIQUE", "ELECTRONIQUE", "HYBRIDE"]),
  plannedRoute: requiredPlanningText("L'itinéraire"),
  transportMethod: z.string({ message: "Le moyen de transport est requis." }).trim().min(1, "Le moyen de transport est requis.").max(40),
  transportMethodOther: optionalChoiceDetail,
  ceibaParticipantIds: participantIds("Choisissez au moins un intervenant CEIBA habilité."),
  sdaParticipantIds: participantIds("Choisissez au moins un intervenant SDA habilité."),
  risks: choiceList("Cochez au moins un risque identifié."),
  riskOther: optionalChoiceDetail,
  securityMeasures: choiceList("Cochez au moins une mesure de sécurisation."),
  securityMeasureOther: optionalChoiceDetail,
  motif: z.string().trim().max(2_000, "Le motif est trop long.").optional().or(z.literal("")),
  cartonTokens: z.array(z.string().trim().min(1).max(500))
    .min(1, "Sélectionnez au moins un carton.")
    .max(200, "Une opération peut contenir au maximum 200 cartons."),
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
  vehicleRegistration: optionalShortText,
  vehicleDescription: optionalShortText,
  driverName: optionalShortText,
  driverPhone: optionalShortText,
  ceibaEscortName: optionalShortText,
  sealReferences: optionalLongText,
  sealStatus: z.enum(["INTACTS", "ANOMALIE", "NON_APPLICABLE"]).optional(),
  incidentReported: z.preprocess((value) => value === "true" || value === "1" || value === "on", z.boolean()),
  incidentDescription: optionalLongText,
  ministryName: optionalShortText,
  ministryTitle: optionalShortText,
  ministrySignature: optionalSignature,
  ceibacName: z.string().trim().min(2, "Le nom du signataire CEIBA est requis.").max(120),
  ceibacTitle: z.string().trim().min(2, "La fonction du signataire CEIBA est requise.").max(120),
  ceibacSignature: signatureData,
}).superRefine((value, context) => {
  if (!value.vehicleRegistration) context.addIssue({ code: "custom", path: ["vehicleRegistration"], message: "L'immatriculation du véhicule est requise." });
  if (!value.vehicleDescription) context.addIssue({ code: "custom", path: ["vehicleDescription"], message: "La description du véhicule sécurisé est requise." });
  if (!value.driverName) context.addIssue({ code: "custom", path: ["driverName"], message: "Le nom du chauffeur est requis." });
  if (!value.ceibaEscortName) context.addIssue({ code: "custom", path: ["ceibaEscortName"], message: "Le nom du convoyeur CEIBA est requis." });
  if (value.type === "RECEPTION") {
    if (!value.conditionStatus) context.addIssue({ code: "custom", path: ["conditionStatus"], message: "L'état du chargement à l'arrivée est requis." });
    if (!value.sealStatus) context.addIssue({ code: "custom", path: ["sealStatus"], message: "L'état des scellés est requis." });
    if (value.conditionStatus !== "CONFORME" && !value.observations) {
      context.addIssue({ code: "custom", path: ["observations"], message: "Décrivez les réserves ou la non-conformité constatée." });
    }
  }
  if ((value.incidentReported || value.conditionStatus === "NON_CONFORME" || value.sealStatus === "ANOMALIE") && !value.incidentDescription) {
    context.addIssue({ code: "custom", path: ["incidentDescription"], message: "Le constat d'incident ou d'anomalie est requis." });
  }
});

export type CreateTransferLotInput = z.infer<typeof createTransferLotSchema>;
export type RecordTransferMovementInput = z.infer<typeof recordTransferMovementSchema>;
