import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_BYTES = 72;

export const securePasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères`)
  .max(128, "Le mot de passe est trop long")
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= PASSWORD_MAX_BYTES,
    `Le mot de passe ne doit pas dépasser ${PASSWORD_MAX_BYTES} octets`
  );
