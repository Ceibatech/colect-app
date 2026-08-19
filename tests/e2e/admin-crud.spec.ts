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

test("administration : création d'un site (Phase 16+)", async ({ page }) => {
  // "code" limité à 20 caractères (siteSchema.code) — mêmes contraintes que Commune ci-dessus.
  const code = `E2E-STE-${String(UNIQUE).slice(-8)}`;
  let siteId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.admin);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/administration/sites");
    await page.getByRole("button", { name: "Nouveau site" }).click();

    await page.getByLabel("Code site").fill(code);
    await page.getByLabel("Nom du site").fill(`Site E2E ${UNIQUE}`);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Site créé.")).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();

    const site = await testPrisma.site.findUniqueOrThrow({ where: { code } });
    siteId = site.id;
    expect(site.nom).toBe(`Site E2E ${UNIQUE}`);
    expect(site.isActive).toBe(true);
  } finally {
    if (siteId) await testPrisma.site.delete({ where: { id: siteId } }).catch(() => {});
  }
});

test("administration : géolocalisation d'un site via le bouton 'Capturer ma position GPS' (Phase 17+)", async ({ page, context }) => {
  // Coordonnées de test (siège du MULCV, Abidjan Plateau — valeur d'exemple,
  // seule la mécanique de capture est testée ici). Le géocodage inverse
  // (adresse GPS) appelle un vrai service externe (OpenStreetMap/Nominatim)
  // — non asserté ici pour ne pas rendre ce test dépendant d'un réseau tiers.
  const LAT = 5.32;
  const LON = -4.0167;
  const code = `E2E-GPS-${String(UNIQUE).slice(-8)}`;
  let siteId: number | undefined;

  try {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 12 });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.admin);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/administration/sites");
    await page.getByRole("button", { name: "Nouveau site" }).click();
    await page.getByLabel("Code site").fill(code);
    await page.getByLabel("Nom du site").fill(`Site GPS E2E ${UNIQUE}`);

    await page.getByRole("button", { name: "Capturer ma position GPS" }).click();
    await expect(page.getByText("Position capturée.")).toBeVisible();

    const latitudeInput = page.getByLabel("Latitude");
    const longitudeInput = page.getByLabel("Longitude");
    await expect(latitudeInput).toHaveValue(LAT.toFixed(6));
    await expect(longitudeInput).toHaveValue(LON.toFixed(6));

    await page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Site créé.")).toBeVisible();

    const site = await testPrisma.site.findUniqueOrThrow({ where: { code } });
    siteId = site.id;
    expect(site.latitude).toBeCloseTo(LAT, 5);
    expect(site.longitude).toBeCloseTo(LON, 5);
    expect(site.pointGps).toBe(`${LAT.toFixed(6)}, ${LON.toFixed(6)}`);
  } finally {
    if (siteId) await testPrisma.site.delete({ where: { id: siteId } }).catch(() => {});
  }
});

test("administration : création d'un entrepôt rattaché à un site (Phase 17+)", async ({ page }) => {
  const code = `E2E-ENT-${String(UNIQUE).slice(-8)}`;
  const site = await testPrisma.site.findFirstOrThrow({ where: { isActive: true } });
  let entrepotId: number | undefined;

  try {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(DEMO_USERS.admin);
    await page.getByLabel("Mot de passe").fill("Demo@2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/dashboard");

    await page.goto("/administration/entrepots");
    await page.getByRole("button", { name: "Nouvel entrepôt" }).click();

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: site.nom, exact: true }).click();
    await page.getByLabel("Code entrepôt").fill(code);
    await page.getByLabel("Nom").fill(`Entrepôt E2E ${UNIQUE}`);
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Entrepôt créé.")).toBeVisible();
    await expect(page.getByText(code)).toBeVisible();

    const entrepot = await testPrisma.entrepot.findUniqueOrThrow({ where: { code } });
    entrepotId = entrepot.id;
    expect(entrepot.nom).toBe(`Entrepôt E2E ${UNIQUE}`);
    expect(entrepot.siteId).toBe(site.id);
    expect(entrepot.isActive).toBe(true);
  } finally {
    if (entrepotId) await testPrisma.entrepot.delete({ where: { id: entrepotId } }).catch(() => {});
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
