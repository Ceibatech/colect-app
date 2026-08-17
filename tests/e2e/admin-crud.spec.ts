import { test, expect } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E (Phase 15+) : écrans d'administration CRUD (communes, utilisateurs).
 * Toutes les entités créées ici sont marquées UNIQUE (timestamp) et
 * nettoyées en fin de test — jamais de donnée fictive laissée dans une base
 * autre que celle du test.
 */

const UNIQUE = Date.now();

test("administration : création d'une commune", async ({ page }) => {
  // "code" est limité à 20 caractères (communeSchema.code, cf. validation/referentiels.ts)
  // — on ne garde que les 8 derniers chiffres du timestamp pour rester dans la limite.
  const code = `E2E-${String(UNIQUE).slice(-8)}`;
  let communeId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.admin);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/administration/communes");
    await page.getByRole("button", { name: "Nouvelle commune" }).click();

    await page.getByLabel("Code").fill(code);
    await page.getByLabel("Nom").fill(`Commune E2E ${UNIQUE}`);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Commune créée.")).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();

    const commune = await testPrisma.commune.findUniqueOrThrow({ where: { code } });
    communeId = commune.id;
    expect(commune.nom).toBe(`Commune E2E ${UNIQUE}`);
    expect(commune.isActive).toBe(true);
  } finally {
    if (communeId) await testPrisma.commune.delete({ where: { id: communeId } }).catch(() => {});
  }
});

test("administration : création d'un utilisateur Opérateur crée automatiquement sa fiche opérateur", async ({ page }) => {
  const email = `e2e-admin-crud-${UNIQUE}@example.com`;
  let userId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.admin);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/administration/utilisateurs");
    await page.getByRole("button", { name: "Nouvel utilisateur" }).click();

    await page.getByLabel("Nom complet").fill(`E2E Opérateur ${UNIQUE}`);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Mot de passe initial").fill("MotDePasse1E2E");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Opérateur", exact: true }).click();
    await page.getByRole("button", { name: "Créer le compte" }).click();

    await expect(page.getByText("Compte créé.")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    const user = await testPrisma.user.findUniqueOrThrow({ where: { email }, include: { role: true, operateur: true } });
    userId = user.id;
    expect(user.role.code).toBe("OPERATEUR");
    expect(user.operateur).not.toBeNull();
    expect(user.operateur?.matricule).toMatch(/^OP-\d{3}$/);
    expect(user.operateur?.isActive).toBe(true);
  } finally {
    if (userId) {
      await testPrisma.operateur.deleteMany({ where: { userId } }).catch(() => {});
      await testPrisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  }
});
