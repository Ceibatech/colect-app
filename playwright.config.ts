import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Tests API + E2E (Phase 13, §72). Deux projets distincts partageant le même
 * serveur :
 *  - "api"  : tests/api/**  — appels HTTP directs (Playwright `request`),
 *             authentifiés via un cookie de session miné avec le même
 *             AUTH_SECRET que l'application (voir tests/helpers/auth.ts).
 *             Pas de navigateur, rapide et fiable.
 *  - "e2e"  : tests/e2e/**  — navigation réelle dans Chromium. `channel:
 *             "chrome"` utilise le Google Chrome déjà installé sur la
 *             machine plutôt que de télécharger un Chromium dédié
 *             (l'environnement de build n'a pas d'accès sortant vers
 *             cdn.playwright.dev) — voir TESTING.md.
 *
 * Le serveur de dev (`npm run dev`, port 3000) est réutilisé s'il tourne
 * déjà (cas courant en développement local, cf. `preview_start`) ; sinon
 * Playwright le démarre lui-même (CI).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "api",
      testDir: "./tests/api",
    },
    {
      name: "e2e",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
