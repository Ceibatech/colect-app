import { test, expect, type Page } from "@playwright/test";
import { testPrisma, sessionCookieHeader, DEMO_USERS } from "../helpers/auth";

/**
 * E2E (Phase 13, §72) : cycle complet du cahier des charges —
 *   Connexion → Création dossier → Sauvegarde → Soumission → Contrôle →
 *   Validation → Numérisation → Indexation → Archivage.
 *
 * Approche hybride assumée et documentée (voir TESTING.md) : la connexion et
 * toute la Collecte (formulaire CG1020 multi-étapes, §40) sont pilotées dans
 * un vrai navigateur Chromium (clics, saisie, sélection) — c'est la partie
 * qui a le plus de valeur à être testée "comme un utilisateur". Les
 * transitions de workflow (Contrôle → Validation → Numérisation →
 * Indexation → Archivage, §42) réutilisent les mêmes routes REST déjà
 * couvertes unitairement par tests/api/workflow.spec.ts — les rejouer ici
 * au clic n'apporterait pas de couverture supplémentaire, seulement de la
 * fragilité — on les déclenche donc via `request` (HTTP direct, cookie de
 * session miné par rôle) puis on revient dans le navigateur pour vérifier
 * visuellement le statut final "Archivé" sur la fiche dossier.
 */

const UNIQUE = Date.now();
const CODE_BARRES = `TEST-E2E-${UNIQUE}`;

async function fillField(page: Page, label: string, value: string) {
  const field = page.locator('[data-slot="field"]').filter({ has: page.getByText(label, { exact: true }) });
  await field.locator("input, textarea").first().fill(value);
}

async function selectCombobox(page: Page, fieldLabel: string, optionLabel: string) {
  const field = page.locator('[data-slot="field"]').filter({ has: page.getByText(fieldLabel, { exact: true }) });
  await field.getByRole("combobox").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

async function clickNext(page: Page) {
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
}

test("cycle complet CG1020 : connexion → collecte → soumission → contrôle → validation → numérisation → indexation → archivage", async ({
  page,
  request,
}) => {
  // Référentiel réel du seed (Phase 2) — jamais de valeur inventée : on
  // prend simplement la première commune qui a au moins un lotissement, et
  // la première nature de dossier disponible.
  const commune = await testPrisma.commune.findFirstOrThrow({
    where: { lotissements: { some: {} } },
    include: { lotissements: { take: 1 } },
  });
  const lotissement = commune.lotissements[0];
  const nature = await testPrisma.natureDossier.findFirstOrThrow();

  // --- 1. CONNEXION (vrai formulaire, vrai Server Action) ---
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO_USERS.operateur1);
  await page.getByLabel("Mot de passe").fill("Demo@2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");

  // --- 2. CRÉATION DOSSIER (Collecte, fiche CG1020, §40) ---
  await page.goto("/collecte/nouveau");
  await expect(page.getByText("Collecte — Fiche d'inventaire CG1020")).toBeVisible();

  // Étape 1 — Site (Phase 16+, optionnel tant que le référentiel `sites` du
  // seed n'a rien de spécifique à sélectionner ici — testé séparément dans
  // site-field.spec.ts)
  await clickNext(page);

  // Étape 2 — Identification (opérateur = lui-même, champ verrouillé)
  await fillField(page, "Libellé du carton", `Carton E2E ${UNIQUE}`);
  await fillField(page, "Code-barres", CODE_BARRES);
  await clickNext(page);

  // Étape 3 — Informations foncières
  await fillField(page, "N° îlot", "I-E2E");
  await fillField(page, "N° lot", "L-E2E");
  await fillField(page, "Superficie (m²)", "375");
  await selectCombobox(page, "Commune", commune.nom);
  await fillField(page, "Lotissement", lotissement.nom);
  await clickNext(page);

  // Étape 4 — Dossier (nature, Select à liste fermée + "Autres", Phase 15+)
  await selectCombobox(page, "Nature du dossier", nature.libelle);
  await clickNext(page);

  // Étape 5 — Titulaire (champs obligatoires à la soumission, §41)
  await fillField(page, "Nom", "Kouadio");
  await fillField(page, "Prénoms", "Aya E2E");
  await fillField(page, "Adresse", "12 Rue des Tests, Abidjan");
  await fillField(page, "Téléphone", "0102030405");
  await fillField(page, "E-mail", "aya.kouadio.e2e@example.com");
  await clickNext(page);

  // Étape 6 — Contact
  await fillField(page, "Personne à contacter", "Kouadio Aya");
  await fillField(page, "Mobile", "0708091011");
  await clickNext(page);

  // Étape 7 — Suivi
  await fillField(page, "Nombre de pages", "8");
  await clickNext(page);

  // Étape 8 — Récapitulatif -> SOUMISSION (§41)
  await expect(page.getByText("Vérifiez les informations avant de soumettre")).toBeVisible();
  await page.getByRole("button", { name: "Soumettre" }).click();

  await expect(page.getByText("Dossier soumis avec succès")).toBeVisible();
  const referenceText = await page.locator("span.font-mono").first().textContent();
  const reference = referenceText?.trim();
  expect(reference).toMatch(/^DOS-\d{4}-\d{6}$/);

  const dossier = await testPrisma.dossier.findUniqueOrThrow({ where: { reference } });
  expect(dossier.statutCollecte).toBe("SOUMIS");
  expect(dossier.statutValidation).toBe("EN_CONTROLE"); // "Contrôle" (§42) : soumis = automatiquement en contrôle.
  expect(dossier.codeBarres).toBe(CODE_BARRES);

  try {
    // --- 3. VALIDATION (SUPERVISEUR) — API REST déjà testée en détail par workflow.spec.ts ---
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const validateRes = await request.post(`/api/dossiers/${dossier.id}/validate`, {
      headers: { Cookie: superviseurCookie },
    });
    expect(validateRes.status()).toBe(200);

    // --- 4. NUMÉRISATION, 5. INDEXATION, 6. ARCHIVAGE (OPERATEUR) ---
    // Phase 19+ : chaque étape est soumise par l'opérateur ("À valider") puis
    // validée par le superviseur ("Terminé") avant de débloquer la suivante
    // — même principe que la validation de Collecte ci-dessus, désormais
    // répété à chaque étape (détail des transitions déjà testé par
    // workflow.spec.ts, on vérifie ici seulement l'enchaînement bout en bout).
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const numerizeRes = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
      headers: { Cookie: operateurCookie },
      data: { nombrePages: 8 },
    });
    expect(numerizeRes.status()).toBe(200);
    expect((await numerizeRes.json()).dossier.statutNumerisation).toBe("A_VALIDER");
    const numerizeValidateRes = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, {
      headers: { Cookie: superviseurCookie },
    });
    expect(numerizeValidateRes.status()).toBe(200);

    const indexRes = await request.post(`/api/dossiers/${dossier.id}/index`, {
      headers: { Cookie: operateurCookie },
      data: { scoreQualite: 95 },
    });
    expect(indexRes.status()).toBe(200);
    expect((await indexRes.json()).dossier.statutIndexation).toBe("A_VALIDER");
    const indexValidateRes = await request.post(`/api/dossiers/${dossier.id}/index/validate`, {
      headers: { Cookie: superviseurCookie },
    });
    expect(indexValidateRes.status()).toBe(200);

    const archiveRes = await request.post(`/api/dossiers/${dossier.id}/archive`, {
      headers: { Cookie: operateurCookie },
      data: { emplacement: "Rayon E2E, étagère 1" },
    });
    expect(archiveRes.status()).toBe(200);
    expect((await archiveRes.json()).dossier.statutArchivage).toBe("A_VALIDER");
    const archiveValidateRes = await request.post(`/api/dossiers/${dossier.id}/archive/validate`, {
      headers: { Cookie: superviseurCookie },
    });
    expect(archiveValidateRes.status()).toBe(200);

    // --- 7. VÉRIFICATION VISUELLE FINALE — retour dans le navigateur ---
    await page.goto(`/dossiers/${dossier.id}`);
    await expect(page.getByText(dossier.reference).first()).toBeVisible();
    await expect(page.getByText("Terminé").first()).toBeVisible();

    const final = await testPrisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(final.statutValidation).toBe("VALIDE");
    expect(final.statutNumerisation).toBe("TERMINE");
    expect(final.statutIndexation).toBe("TERMINE");
    expect(final.statutArchivage).toBe("TERMINE");
  } finally {
    await testPrisma.dossier.delete({ where: { id: dossier.id } }).catch(() => {});
  }
});
