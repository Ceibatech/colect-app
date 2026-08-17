import { test, expect, type Page } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E dédié au champ "Direction/Service concerné(e)" (anciennement "N° DDU")
 * de la Collecte, Phase 15+ : liste fermée + option "Autres" qui bascule
 * vers une saisie libre (StepIdentification.tsx). Le scénario complet
 * (full-cycle.spec.ts) ne remplit pas ce champ optionnel — ce test vérifie
 * spécifiquement son comportement interactif.
 */

const UNIQUE = Date.now();

async function fillField(page: Page, label: string, value: string) {
  const field = page.locator('[data-slot="field"]').filter({ has: page.getByText(label, { exact: true }) });
  await field.locator("input, textarea").first().fill(value);
}

async function selectCombobox(page: Page, fieldLabel: string, optionLabel: string) {
  const field = page.locator('[data-slot="field"]').filter({ has: page.getByText(fieldLabel, { exact: true }) });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

test("Direction/Service : sélection dans la liste fermée, puis bascule vers Autres avec saisie libre", async ({ page }) => {
  const codeBarres = `TEST-DIRSVC-${UNIQUE}`;
  let dossierId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.operateur1);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/collecte/nouveau");
    await expect(page.getByText("Collecte — Fiche d'inventaire CG1020")).toBeVisible();

    await fillField(page, "Code-barres", codeBarres);

    // --- 1. Sélectionner une valeur de la liste fermée (GUF) ---
    await selectCombobox(page, "Direction/Service concerné(e)", "GUF");
    const dirServiceField = page.locator('[data-slot="field"]').filter({ has: page.getByText("Direction/Service concerné(e)", { exact: true }) });
    await expect(dirServiceField.getByRole("combobox")).toContainText("GUF");
    // Pas de champ de saisie libre affiché pour une valeur connue.
    await expect(page.getByPlaceholder("Préciser la direction/service")).toHaveCount(0);

    // --- 2. Basculer vers "Autres" -> champ de saisie libre affiché ---
    await selectCombobox(page, "Direction/Service concerné(e)", "Autres (préciser)");
    const freeText = page.getByPlaceholder("Préciser la direction/service");
    await expect(freeText).toBeVisible();
    await freeText.fill("Service Foncier Régional Test");

    // --- 3. Numéro Direction/Service (champ juste après) ---
    await fillField(page, "Numéro Direction/Service", "REF-E2E-001");

    // --- Enregistrer en brouillon et vérifier en base ---
    await page.getByRole("button", { name: "Enregistrer brouillon" }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();

    const dossier = await testPrisma.dossier.findFirstOrThrow({ where: { codeBarres } });
    dossierId = dossier.id;
    expect(dossier.numeroDdu).toBe("Service Foncier Régional Test");
    expect(dossier.numeroDirectionService).toBe("REF-E2E-001");
  } finally {
    if (dossierId) await testPrisma.dossier.delete({ where: { id: dossierId } }).catch(() => {});
  }
});
