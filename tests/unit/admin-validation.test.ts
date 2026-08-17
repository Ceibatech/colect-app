import { describe, expect, it } from "vitest";
import { communeSchema, lotissementSchema, natureDossierSchema } from "@/lib/validation/referentiels";
import { createUserSchema, updateUserSchema, resetPasswordSchema } from "@/lib/validation/user-admin";

describe("communeSchema (CRUD administration, Phase 15+)", () => {
  it("accepte une commune valide", () => {
    expect(communeSchema.safeParse({ code: "COM-01", nom: "Commune Test", isActive: true }).success).toBe(true);
  });

  it("rejette un code ou un nom vide", () => {
    expect(communeSchema.safeParse({ code: "", nom: "X" }).success).toBe(false);
    expect(communeSchema.safeParse({ code: "COM-01", nom: "" }).success).toBe(false);
  });

  it("accepte une description absente (chaîne vide)", () => {
    const result = communeSchema.safeParse({ code: "COM-01", nom: "Commune Test", description: "" });
    expect(result.success).toBe(true);
  });

  it("applique isActive=true par défaut si absent", () => {
    const result = communeSchema.safeParse({ code: "COM-01", nom: "Commune Test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.isActive).toBe(true);
  });
});

describe("lotissementSchema", () => {
  it("exige un communeId positif", () => {
    expect(lotissementSchema.safeParse({ communeId: 1, code: "LOT-01", nom: "Lot Test" }).success).toBe(true);
    expect(lotissementSchema.safeParse({ communeId: 0, code: "LOT-01", nom: "Lot Test" }).success).toBe(false);
    expect(lotissementSchema.safeParse({ code: "LOT-01", nom: "Lot Test" }).success).toBe(false);
  });

  it("coerce un communeId envoyé en chaîne (FormData)", () => {
    const result = lotissementSchema.safeParse({ communeId: "3", code: "LOT-01", nom: "Lot Test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.communeId).toBe(3);
  });
});

describe("natureDossierSchema", () => {
  it("accepte une nature valide (libelle, pas nom)", () => {
    expect(natureDossierSchema.safeParse({ code: "NAT-TF", libelle: "Titre foncier" }).success).toBe(true);
  });

  it("rejette un libellé vide", () => {
    expect(natureDossierSchema.safeParse({ code: "NAT-TF", libelle: "" }).success).toBe(false);
  });
});

describe("createUserSchema (administration utilisateurs)", () => {
  const valid = { name: "Jean Dupont", email: "jean.dupont@example.com", password: "MotDePasse1", roleId: 1 };

  it("accepte une création valide", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette un mot de passe de moins de 8 caractères", () => {
    expect(createUserSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
  });

  it("rejette un e-mail invalide", () => {
    expect(createUserSchema.safeParse({ ...valid, email: "pas-un-email" }).success).toBe(false);
  });

  it("rejette un roleId absent ou invalide", () => {
    const { roleId: _roleId, ...rest } = valid;
    void _roleId;
    expect(createUserSchema.safeParse(rest).success).toBe(false);
    expect(createUserSchema.safeParse({ ...valid, roleId: 0 }).success).toBe(false);
  });

  it("accepte un téléphone absent (optionnel)", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true);
  });
});

describe("updateUserSchema", () => {
  it("accepte une mise à jour valide", () => {
    expect(updateUserSchema.safeParse({ name: "Jean Dupont", roleId: 2, isActive: true }).success).toBe(true);
  });

  it("rejette un nom vide", () => {
    expect(updateUserSchema.safeParse({ name: "", roleId: 2, isActive: true }).success).toBe(false);
  });
});

describe("resetPasswordSchema (réinitialisation par un administrateur)", () => {
  it("accepte un mot de passe et sa confirmation identiques", () => {
    expect(resetPasswordSchema.safeParse({ newPassword: "NouveauMdp1", confirmPassword: "NouveauMdp1" }).success).toBe(true);
  });

  it("rejette une confirmation différente", () => {
    const result = resetPasswordSchema.safeParse({ newPassword: "NouveauMdp1", confirmPassword: "Different1" });
    expect(result.success).toBe(false);
  });

  it("rejette un mot de passe trop court", () => {
    expect(resetPasswordSchema.safeParse({ newPassword: "short1", confirmPassword: "short1" }).success).toBe(false);
  });
});
