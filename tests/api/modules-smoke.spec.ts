import { test, expect } from "@playwright/test";
import { sessionCookieHeader, DEMO_USERS } from "../helpers/auth";
import { NAV_ITEMS, type NavItem } from "../../src/config/navigation";

/**
 * Non-régression par module : chaque page du menu, de tous les modules,
 * doit s'afficher sans erreur (200, ni redirection ni erreur serveur).
 * La liste vient du menu lui-même : un module ajouté est couvert d'office.
 * Une modification qui casse un autre module bloque donc le déploiement.
 */
const flatten = (items: NavItem[]): string[] => items.flatMap((item) => [item.href, ...flatten(item.children ?? [])]);
const PAGES = [...new Set([...flatten(NAV_ITEMS), "/collecte/nouveau", "/transferts/nouveau", "/compte"])].sort();

// Pages qui interrogent une API à l'ouverture : la route doit répondre aussi.
const APIS = ["/api/health", "/api/cartons/choix?q=2010", "/api/transferts/vehicules", "/api/recherche/suggestions?stage=preparation&q=test"];

const ERROR_MARKERS = [/Application error/i, /Internal Server Error/i, /Une erreur (est survenue|inattendue)/i];

test.describe("Chaque module s'affiche sans erreur (administrateur)", () => {
  for (const path of PAGES) {
    test(`GET ${path}`, async ({ request }) => {
      const cookie = await sessionCookieHeader(DEMO_USERS.admin);
      const res = await request.get(path, { headers: { Cookie: cookie }, maxRedirects: 0 });
      expect(res.status(), `${path} doit répondre 200`).toBe(200);
      const html = await res.text();
      for (const marker of ERROR_MARKERS) expect(html, `${path} affiche une erreur`).not.toMatch(marker);
    });
  }

  for (const path of APIS) {
    test(`GET ${path}`, async ({ request }) => {
      const cookie = await sessionCookieHeader(DEMO_USERS.admin);
      const res = await request.get(path, { headers: { Cookie: cookie } });
      expect(res.status(), `${path} doit répondre 200`).toBe(200);
    });
  }
});
