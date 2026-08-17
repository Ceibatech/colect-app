import { test, expect, type Page } from "@playwright/test";
import { testPrisma, DEMO_USERS } from "../helpers/auth";

/**
 * E2E dédié à l'état de conservation carton/dossier (Phase 15+) : deux
 * champs identiques en comportement (Bon état / Dégradé), la description ne
 * s'affichant et n'étant persistée que si "Dégradé" est choisi — voir
 * EtatConservationField.tsx, utilisé à la fois pour le carton
 * (StepIdentification.tsx) et le dossier (StepDossier.tsx).
 */

const UNIQUE = Date.now();

async function fillField(page: Page, label: string, value: string) {
  const field = page.locator('[data-slot="field"]').filter({ has: page.getByText(label, { exact: true }) });
  await field.locator("input, textarea").first().fill(value);
}

test("État du carton et du dossier : Dégradé révèle la description, Bon état n'en garde aucune", async ({ page }) => {
  const codeBarres = `TEST-ETAT-${UNIQUE}`;
  let dossierId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.operateur1);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/collecte/nouveau");
    await expect(page.getByText("Collecte — Fiche d'inventaire CG1020")).toBeVisible();

    // --- Étape 1 : État du carton = Dégradé, avec description ---
    await fillField(page, "Code-barres", codeBarres);
    await page.getByRole("radio", { name: "Dégradé" }).first().click();
    const cartonDesc = page.getByPlaceholder("Décrire l'état dégradé...");
    await expect(cartonDesc).toBeVisible();
    await cartonDesc.fill("Carton troué, coins abîmés par l'humidité");

    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await page.getByRole("button", { name: "Suivant", exact: true }).click();

    // --- Étape 3 : État du dossier reste "Bon état" (par défaut, non coché) ---
    await expect(page.getByPlaceholder("Décrire l'état dégradé...")).toHaveCount(0);

    await page.getByRole("button", { name: "Enregistrer brouillon" }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();

    const dossier = await testPrisma.dossier.findFirstOrThrow({ where: { codeBarres } });
    dossierId = dossier.id;
    expect(dossier.etatCarton).toBe("DEGRADE");
    expect(dossier.etatCartonDescription).toBe("Carton troué, coins abîmés par l'humidité");
    // Dossier jamais marqué "Dégradé" dans ce scénario -> aucune description
    // ne doit être persistée (rien saisi, champ resté masqué).
    expect(dossier.etatDossier).toBeNull();
    expect(dossier.etatDossierDescription).toBeNull();
  } finally {
    if (dossierId) await testPrisma.dossier.delete({ where: { id: dossierId } }).catch(() => {});
  }
});
