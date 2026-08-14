import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Tests unitaires (Phase 13, §72) : fonctions pures uniquement (validation
 * Zod, score qualité, permissions, taux KPI, CSV) — pas de connexion base de
 * données ni de serveur Next.js. Les tests API/E2E (Playwright) couvrent le
 * reste, voir playwright.config.ts et TESTING.md.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // "server-only" n'est qu'un garde-fou webpack côté Next.js (aucune
      // dépendance npm requise pour l'app) — voir tests/unit/stubs/server-only.ts.
      "server-only": path.resolve(__dirname, "tests/unit/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: false,
  },
});
