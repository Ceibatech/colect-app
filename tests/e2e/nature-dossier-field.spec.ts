import { test, expect, type Page } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E dédié au champ "Nature du dossier" (Phase 15+, remplace le RadioGroup
 * — devenu impraticable avec les 41 natures réelles fournies par le métier —
 * par un Select à liste fermée + "Autres" qui bascule en saisie libre,
 * résolue côté serveur vers une fiche `natures_dossier` (existante ou créée
 * à la volée), même principe que Lotissement.
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

test("Nature du dossier : Autres crée une nouvelle fiche référentiel à la volée (find-or-create)", async ({ page }) => {
  const codeBarres = `TEST-NAT-${UNIQUE}`;
  const nouvelleNature = `Nature E2E Inédite ${UNIQUE}`;
  let dossierId: number | undefined;
  let natureId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.operateur1);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/collecte/nouveau");
    await expect(page.getByText("Collecte — Fiche d'inventaire CG1020")).toBeVisible();

    await fillField(page, "Code-barres", codeBarres);
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByRole("button", { name: "Suivant", exact: true }).click();

    // --- Étape 3 : basculer directement sur "Autres" ---
    await selectCombobox(page, "Nature du dossier", "Autres (préciser)");
    const freeText = page.getByPlaceholder("Préciser la nature du dossier");
    await expect(freeText).toBeVisible();
    await freeText.fill(nouvelleNature);

    await page.getByRole("button", { name: "Enregistrer brouillon" }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();

    const dossier = await testPrisma.dossier.findFirstOrThrow({ where: { codeBarres }, include: { natureDossier: true } });
    dossierId = dossier.id;
    expect(dossier.natureDossier).not.toBeNull();
    expect(dossier.natureDossier?.libelle).toBe(nouvelleNature);
    expect(dossier.natureDossier?.isActive).toBe(true);
    natureId = dossier.natureDossier?.id;

    const countBefore = await testPrisma.natureDossier.count({ where: { libelle: nouvelleNature } });
    expect(countBefore).toBe(1);
  } finally {
    if (dossierId) await testPrisma.dossier.delete({ where: { id: dossierId } }).catch(() => {});
    if (natureId) await testPrisma.natureDossier.delete({ where: { id: natureId } }).catch(() => {});
  }
});
