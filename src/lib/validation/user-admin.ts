import { z } from "zod";
import { normalizePersonName } from "@/lib/utils/person-name";

/** CRUD administration des utilisateurs (Phase 15+, §11/§60). */

const personNameSchema = z.string()
  .transform(normalizePersonName)
  .pipe(z.string().min(1, "Le nom est requis").max(150));

export const createUserSchema = z.object({
  name: personNameSchema,
  email: z.string().min(1, "L'e-mail est requis").email("Format d'e-mail invalide").max(150),
  roleId: z.coerce.number({ message: "Le rôle est requis" }).int().positive("Le rôle est requis"),
  telephone: z.string().max(30).optional().or(z.literal("")),
  supervisorIds: z.array(z.coerce.number().int().positive()).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: personNameSchema,
  roleId: z.coerce.number({ message: "Le rôle est requis" }).int().positive("Le rôle est requis"),
  isActive: z.coerce.boolean().default(true),
  // Phase 16+ : opérateurs affectés à ce compte, uniquement pertinent si le
  // rôle choisi est SUPERVISEUR (ignoré sinon, cf. updateUser()).
  operateurIds: z.array(z.coerce.number().int().positive()).default([]),
  // Superviseurs inclus dans le périmètre d'un compte PMO.
  supervisorIds: z.array(z.coerce.number().int().positive()).default([]),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
