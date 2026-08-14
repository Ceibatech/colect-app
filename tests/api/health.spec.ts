import { test, expect } from "@playwright/test";

/**
 * Tests API (Phase 15, §61/§100) : sonde de disponibilité, publique et sans
 * dépendance à un utilisateur/rôle particulier.
 */
test.describe("GET /api/health", () => {
  test("répond 200 sans authentification", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("up");
    expect(typeof body.timestamp).toBe("string");
    expect(typeof body.latencyMs).toBe("number");
  });

  test("ne redirige jamais vers /login (contrairement aux pages protégées)", async ({ request }) => {
    const res = await request.get("/api/health", { maxRedirects: 0 });
    expect(res.status()).not.toBe(307);
  });
});
