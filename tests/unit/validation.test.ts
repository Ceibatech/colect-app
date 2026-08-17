import { describe, expect, it } from "vitest";
import { loginSchema, changePasswordSchema } from "@/lib/validation/auth";
import { dossierFormSchema, dossierSubmitSchema } from "@/lib/validation/dossier";

describe("loginSchema", () => {
  it("accepte un e-mail et un mot de passe valides", () => {
    expect(loginSchema.safeParse({ email: "admin@mulcv-demo.local", password: "Demo@2026!" }).success).toBe(true);
  });

  it("rejette un e-mail au format invalide", () => {
    const result = loginSchema.safeParse({ email: "pas-un-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejette un e-mail ou un mot de passe vide", () => {
    expect(loginSchema.safeParse({ email: "", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("changePasswordSchema (self-service, Phase 15)", () => {
  const valid = { currentPassword: "AncienMdp1", newPassword: "NouveauMdp1", confirmPassword: "NouveauMdp1" };

  it("accepte un changement valide (nouveau ≥ 8 caractères, confirmation identique, différent de l'actuel)", () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette un nouveau mot de passe de moins de 8 caractères", () => {
    const result = changePasswordSchema.safeParse({ ...valid, newPassword: "Court1", confirmPassword: "Court1" });
    expect(result.success).toBe(false);
  });

  it("rejette si la confirmation ne correspond pas au nouveau mot de passe", () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: "Different1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });

  it("rejette si le nouveau mot de passe est identique à l'actuel", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "MemeMdp123",
      newPassword: "MemeMdp123",
      confirmPassword: "MemeMdp123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("newPassword"))).toBe(true);
    }
  });

  it("rejette un mot de passe actuel vide", () => {
    expect(changePasswordSchema.safeParse({ ...valid, currentPassword: "" }).success).toBe(false);
  });
});

describe("dossierFormSchema (saisie/brouillon — tout optionnel, §40)", () => {
  it("accepte un objet entièrement vide (brouillon vierge)", () => {
    expect(dossierFormSchema.safeParse({}).success).toBe(true);
  });

  it("accepte une chaîne vide pour un champ <input type=number> optionnel non renseigné (comportement RHF — §40 note)", () => {
    // Seuls les champs numériques saisis via <input type="number"> (superficie,
    // nombrePages) reçoivent "" d'un champ vide côté RHF et ont donc le
    // fallback `.or(z.literal(""))`. Les identifiants pilotés par un <Select>
    // (communeId, lotissementId, natureDossierId, operateurId) n'envoient
    // jamais "" — ils restent `undefined` tant qu'aucune option n'est choisie.
    const result = dossierFormSchema.safeParse({ superficie: "", nombrePages: "" });
    expect(result.success).toBe(true);
  });

  it("laisse un identifiant piloté par Select (communeId) undefined tant qu'aucune option n'est choisie", () => {
    const result = dossierFormSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.communeId).toBeUndefined();
  });

  it("coerce une superficie envoyée en chaîne vers un nombre", () => {
    const result = dossierFormSchema.safeParse({ superficie: "450.5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.superficie).toBe(450.5);
  });

  it("rejette une superficie négative ou nulle", () => {
    expect(dossierFormSchema.safeParse({ superficie: "-10" }).success).toBe(false);
    expect(dossierFormSchema.safeParse({ superficie: "0" }).success).toBe(false);
  });

  it("rejette une superficie invraisemblable (> 1 000 000)", () => {
    expect(dossierFormSchema.safeParse({ superficie: "2000000" }).success).toBe(false);
  });

  it("rejette un e-mail titulaire mal formé s'il est renseigné", () => {
    expect(dossierFormSchema.safeParse({ email: "pas-un-email" }).success).toBe(false);
  });

  it("accepte un e-mail titulaire absent (chaîne vide)", () => {
    expect(dossierFormSchema.safeParse({ email: "" }).success).toBe(true);
  });
});

describe("dossierSubmitSchema (soumission finale — champs obligatoires, §41)", () => {
  const validSubmission = {
    communeId: 1,
    lotissementId: 1,
    natureDossierId: 1,
    nom: "Kouassi",
    prenoms: "Jean",
  };

  it("accepte une soumission avec tous les champs obligatoires renseignés", () => {
    expect(dossierSubmitSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("rejette une soumission sans commune", () => {
    const { communeId, ...rest } = validSubmission;
    void communeId;
    expect(dossierSubmitSchema.safeParse(rest).success).toBe(false);
  });

  it("rejette une soumission sans lotissement", () => {
    const { lotissementId, ...rest } = validSubmission;
    void lotissementId;
    expect(dossierSubmitSchema.safeParse(rest).success).toBe(false);
  });

  it("rejette une soumission sans nature de dossier", () => {
    const { natureDossierId, ...rest } = validSubmission;
    void natureDossierId;
    expect(dossierSubmitSchema.safeParse(rest).success).toBe(false);
  });

  it("rejette une soumission sans nom ou prénoms du titulaire", () => {
    expect(dossierSubmitSchema.safeParse({ ...validSubmission, nom: "" }).success).toBe(false);
    expect(dossierSubmitSchema.safeParse({ ...validSubmission, prenoms: "" }).success).toBe(false);
  });

  it("rejette un objet vide (aucun champ obligatoire renseigné)", () => {
    expect(dossierSubmitSchema.safeParse({}).success).toBe(false);
  });
});
