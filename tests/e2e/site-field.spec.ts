import { test, expect, type Page } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E dédié à la nouvelle étape 1 "Site" de la Collecte (Phase 16+) :
 * sélection d'un site d'archivage existant (référentiel géré depuis
 * /administration/sites, cf. SitesManager.tsx), et de son entrepôt en
 * cascade (Phase 17+, cf. EntrepotsManager.tsx — "un site peut avoir un ou
 * plusieurs entrepôts"). Les deux champs sont optionnels à la soumission
 * (voir dossierFormSchema) — ce test vérifie qu'un choix est bien persisté
 * (`dossier.siteId`/`entrepotId`), pas que les champs sont obligatoires.
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

test("Site + Entrepôt : sélectionnés en cascade à l'étape 1, persistés sur le dossier et affichés au récapitulatif", async ({ page }) => {
  const codeBarres = `TEST-SITE-${UNIQUE}`;
  const entrepot = await testPrisma.entrepot.findFirstOrThrow({ where: { isActive: true }, include: { site: true } });
  const site = entrepot.site;
  let dossierId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.operateur1);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/collecte/nouveau");
    await expect(page.getByText("Collecte — Fiche d'inventaire CG1020")).toBeVisible();

    // --- Étape 1 : Site — c'est la toute première étape du formulaire ---
    await expect(page.getByText("Étape 1 / 8 — Site")).toBeVisible();
    await selectCombobox(page, "Site d'archivage", `${site.nom} (${site.code})`);
    // Le résumé en lecture seule confirme la sélection.
    await expect(page.getByText(site.nom, { exact: false })).toBeVisible();

    // L'entrepôt n'est sélectionnable qu'une fois le site choisi (cascade).
    await selectCombobox(page, "Entrepôt", `${entrepot.nom} (${entrepot.code})`);

    await page.getByRole("button", { name: "Suivant", exact: true }).click();

    await fillField(page, "Code-barres", codeBarres);

    await page.getByRole("button", { name: "Enregistrer brouillon" }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();

    const dossier = await testPrisma.dossier.findFirstOrThrow({ where: { codeBarres } });
    dossierId = dossier.id;
    expect(dossier.siteId).toBe(site.id);
    expect(dossier.entrepotId).toBe(entrepot.id);
  } finally {
    if (dossierId) await testPrisma.dossier.delete({ where: { id: dossierId } }).catch(() => {});
  }
});
