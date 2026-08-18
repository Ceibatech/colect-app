import { z } from "zod";

/** CRUD administration des utilisateurs (Phase 15+, §11/§60). */

export const createUserSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(150),
  email: z.string().min(1, "L'e-mail est requis").email("Format d'e-mail invalide").max(150),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  roleId: z.coerce.number({ message: "Le rôle est requis" }).int().positive("Le rôle est requis"),
  telephone: z.string().max(30).optional().or(z.literal("")),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(150),
  roleId: z.coerce.number({ message: "Le rôle est requis" }).int().positive("Le rôle est requis"),
  isActive: z.coerce.boolean().default(true),
  // Phase 16+ : opérateurs affectés à ce compte, uniquement pertinent si le
  // rôle choisi est SUPERVISEUR (ignoré sinon, cf. updateUser()).
  operateurIds: z.array(z.coerce.number().int().positive()).default([]),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères"),
    confirmPassword: z.string().min(1, "La confirmation est requise"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
