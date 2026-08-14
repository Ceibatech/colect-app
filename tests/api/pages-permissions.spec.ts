import { test, expect } from "@playwright/test";
import { sessionCookieHeader, DEMO_USERS } from "../helpers/auth";

/**
 * Tests API (Phase 13, §72) — accès aux pages protégées, HTTP pur (pas de
 * navigateur), même technique que la vérification manuelle des Phases 3 à 12
 * (curl + cookie de session miné). Couvre les deux niveaux de contrôle
 * (§60) : le préfixe grossier `ROLE_ONLY_ROUTE_PREFIXES` (src/proxy.ts) et
 * la permission fine `requirePermission()` de chaque page.
 *
 * Le dashboard/les dossiers n'exposent pas de route /api/ dédiée (Server
 * Components qui appellent directement les services) — on vérifie donc le
 * rendu HTTP de la page elle-même (statut + redirection), sans suivre les
 * redirections pour pouvoir les assert.
 */

test.describe("Pages non authentifiées", () => {
  for (const path of ["/dashboard", "/dossiers", "/collecte/nouveau", "/administration/audit"]) {
    test(`GET ${path} sans session redirige vers /login`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers()["location"]).toContain("/login");
    });
  }
});

test.describe("Pages accessibles à tous les rôles authentifiés (DASHBOARD_VIEW/DOSSIER_READ)", () => {
  for (const [role, email] of Object.entries(DEMO_USERS)) {
    test(`GET /dashboard est accessible au rôle ${role}`, async ({ request }) => {
      const cookie = await sessionCookieHeader(email);
      const res = await request.get("/dashboard", { headers: { Cookie: cookie }, maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });

    test(`GET /dossiers est accessible au rôle ${role}`, async ({ request }) => {
      const cookie = await sessionCookieHeader(email);
      const res = await request.get("/dossiers", { headers: { Cookie: cookie }, maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }
});

test.describe("/administration/audit — permission AUDIT_VIEW (bug corrigé Phase 12, non-régression)", () => {
  test("ADMIN accède à /administration/audit", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get("/administration/audit", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("SUPERVISEUR accède à /administration/audit (a AUDIT_VIEW, pas de blocage préfixe)", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.get("/administration/audit", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("OPERATEUR n'accède pas à /administration/audit (pas AUDIT_VIEW)", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const res = await request.get("/administration/audit", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("error=forbidden");
  });
});

test.describe("/administration/utilisateurs — permission USER_MANAGE (ADMIN uniquement)", () => {
  test("ADMIN accède à /administration/utilisateurs", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get("/administration/utilisateurs", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("SUPERVISEUR n'accède pas à /administration/utilisateurs (pas USER_MANAGE, malgré AUDIT_VIEW ailleurs)", async ({
    request,
  }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.get("/administration/utilisateurs", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("error=forbidden");
  });
});

test.describe("/qualite — préfixe réservé ADMIN/SUPERVISEUR (src/proxy.ts)", () => {
  test("ADMIN accède à /qualite", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get("/qualite", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("OPERATEUR n'accède pas à /qualite (bloqué au niveau proxy avant même la page)", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const res = await request.get("/qualite", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("error=forbidden");
  });

  test("CONSULTATION n'accède pas à /qualite", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.consultation);
    const res = await request.get("/qualite", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });
});

test.describe("/import — préfixe réservé ADMIN/OPERATEUR (src/proxy.ts)", () => {
  test("OPERATEUR accède à /import", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
    const res = await request.get("/import", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test("SUPERVISEUR n'accède pas à /import", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.get("/import", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("error=forbidden");
  });

  test("CONSULTATION n'accède pas à /import", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.consultation);
    const res = await request.get("/import", { headers: { Cookie: cookie }, maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });
});
