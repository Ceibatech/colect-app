import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { testPrisma } from "../helpers/auth";

/**
 * E2E (Phase 15) : changement de mot de passe self-service (/compte).
 * Utilise un utilisateur JETABLE créé pour ce test uniquement (jamais les
 * comptes de démo partagés par les autres tests — éviter tout effet de bord
 * si les mots de passe changent sous leurs pieds).
 */

const UNIQUE = Date.now();
const EMAIL = `e2e-password-${UNIQUE}@example.com`;
const OLD_PASSWORD = "AncienMotDePasse1";
const NEW_PASSWORD = "NouveauMotDePasse1";

test("changement de mot de passe : connexion, mise à jour via /compte, reconnexion avec le nouveau mot de passe", async ({ page }) => {
  const role = await testPrisma.role.findUniqueOrThrow({ where: { code: "OPERATEUR" } });
  const passwordHash = await bcrypt.hash(OLD_PASSWORD, 10);
  const user = await testPrisma.user.create({
    data: { name: "E2E Password", email: EMAIL, passwordHash, roleId: role.id },
  });

  try {
    // --- Connexion avec le mot de passe initial ---
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Mot de passe").fill(OLD_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    // --- Changement de mot de passe via /compte ---
    await page.goto("/compte");
    await expect(page.getByText("Changer mon mot de passe")).toBeVisible();
    await page.getByLabel("Mot de passe actuel").fill(OLD_PASSWORD);
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirmer le nouveau mot de passe").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
    await expect(page.getByText("Mot de passe mis à jour.")).toBeVisible();

    // --- Déconnexion puis reconnexion avec le NOUVEAU mot de passe ---
    await page.goto("/dashboard");
    await page.getByLabel("Menu utilisateur").click();
    await page.getByRole("menuitem", { name: "Déconnexion" }).click();
    await page.waitForURL("**/login");

    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Mot de passe").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    // --- L'ancien mot de passe ne doit plus fonctionner ---
    await page.goto("/dashboard");
    await page.getByLabel("Menu utilisateur").click();
    await page.getByRole("menuitem", { name: "Déconnexion" }).click();
    await page.waitForURL("**/login");
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Mot de passe").fill(OLD_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
  } finally {
    await testPrisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
});
