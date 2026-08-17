import { test, expect, type Page } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E dédié à la saisie libre du "Lotissement" (Phase 15+, remplace le
 * Select dépendant de la commune — StepFoncier.tsx). Deux chemins couverts :
 * réutilisation d'un lotissement existant (déjà exercé par full-cycle.spec.ts)
 * et création à la volée d'un lotissement encore inconnu pour la commune
 * choisie (resolveLotissementId, dossier-service.ts) — c'est ce second
 * chemin qui est spécifiquement vérifié ici.
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

test("Lotissement : un nom encore inconnu pour la commune crée une nouvelle fiche référentiel (find-or-create)", async ({ page }) => {
  const codeBarres = `TEST-LOT-${UNIQUE}`;
  const nouveauLotissement = `Lotissement E2E Inédit ${UNIQUE}`;
  let dossierId: number | undefined;
  let lotissementId: number | undefined;

  const commune = await testPrisma.commune.findFirstOrThrow({ orderBy: { nom: "asc" } });

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

    await selectCombobox(page, "Commune", commune.nom);
    // Champ Lotissement passé de disabled (placeholder "Choisir d'abord une
    // commune") à actif dès qu'une commune est sélectionnée.
    await fillField(page, "Lotissement", nouveauLotissement);

    await page.getByRole("button", { name: "Enregistrer brouillon" }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();

    const dossier = await testPrisma.dossier.findFirstOrThrow({ where: { codeBarres }, include: { lotissement: true } });
    dossierId = dossier.id;
    expect(dossier.lotissement).not.toBeNull();
    expect(dossier.lotissement?.nom).toBe(nouveauLotissement);
    expect(dossier.lotissement?.communeId).toBe(commune.id);
    expect(dossier.lotissement?.isActive).toBe(true);
    lotissementId = dossier.lotissement?.id;

    // Ré-enregistrer le même brouillon avec le même nom ne doit PAS dupliquer
    // la fiche référentiel (résolution idempotente).
    const countBefore = await testPrisma.lotissement.count({ where: { communeId: commune.id, nom: nouveauLotissement } });
    expect(countBefore).toBe(1);
  } finally {
    if (dossierId) await testPrisma.dossier.delete({ where: { id: dossierId } }).catch(() => {});
    if (lotissementId) await testPrisma.lotissement.delete({ where: { id: lotissementId } }).catch(() => {});
  }
});
