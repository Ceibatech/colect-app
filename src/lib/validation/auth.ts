import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().min(1, "L'e-mail est requis").email("Format d'e-mail invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().min(1, "L'e-mail est requis").email("Format d'e-mail invalide").max(150),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordWithTokenSchema = z
  .object({
    token: z.string().length(43, "Le lien de réinitialisation est invalide.").regex(/^[A-Za-z0-9_-]+$/, "Le lien de réinitialisation est invalide."),
    newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères").max(128, "Le nouveau mot de passe est trop long"),
    confirmPassword: z.string().min(1, "La confirmation est requise"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export type ResetPasswordWithTokenInput = z.infer<typeof resetPasswordWithTokenSchema>;

/** Changement de mot de passe (self-service, Phase 15). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
    newPassword: z.string().min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères").max(128, "Le nouveau mot de passe est trop long"),
    confirmPassword: z.string().min(1, "La confirmation est requise"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les deux mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "Le nouveau mot de passe doit être différent de l'actuel",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
