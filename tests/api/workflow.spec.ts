import { test, expect } from "@playwright/test";
import { sessionCookieHeader, DEMO_USERS } from "../helpers/auth";
import { createTestDossier, deleteTestDossier } from "../helpers/db";

/**
 * Tests API (Phase 13, §72) : transitions du workflow contrôlé (§42) —
 * validate/reject/numerize/index/archive. Chaque test crée son propre
 * dossier jetable (préfixe `TEST-API-`) dans l'état exact requis pour
 * isoler la transition testée, et le supprime en fin de test.
 */

test.describe("POST /api/dossiers/[id]/validate", () => {
  test("SUPERVISEUR valide un dossier En contrôle", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutValidation).toBe("VALIDE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de valider un dossier qui n'est pas En contrôle (précondition)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_ATTENTE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse un OPERATEUR sans DOSSIER_VALIDATE (403)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse une requête non authentifiée (401)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`);
      expect(res.status()).toBe(401);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("404 sur un dossier inexistant", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const res = await request.post(`/api/dossiers/999999999/validate`, { headers: { Cookie: cookie } });
    expect(res.status()).toBe(404);
  });
});

test.describe("POST /api/dossiers/[id]/reject", () => {
  test("SUPERVISEUR rejette un dossier En contrôle avec un motif", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Pièces manquantes — dossier de test." },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutValidation).toBe("REJETE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("exige un motif de rejet non vide", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "   " },
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/numerize", () => {
  test("numérise un dossier Validé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
        headers: { Cookie: cookie },
        data: { nombrePages: 12 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutNumerisation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de numériser un dossier non Validé (précondition §42)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de numériser deux fois le même dossier", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/index", () => {
  test("indexe un dossier Numérisé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/index`, {
        headers: { Cookie: cookie },
        data: { scoreQualite: 88 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutIndexation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse d'indexer un dossier non Numérisé (précondition §42)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "EN_ATTENTE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/index`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/archive", () => {
  test("archive un dossier Indexé avec un emplacement", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutNumerisation: "TERMINE",
      statutIndexation: "TERMINE",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/archive`, {
        headers: { Cookie: cookie },
        data: { emplacement: "Rayon T3, étagère 4 (test)" },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutArchivage).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse d'archiver un dossier non Indexé — règle explicite §42 (un dossier ne peut être archivé s'il n'est pas indexé)", async ({
    request,
  }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutNumerisation: "TERMINE",
      statutIndexation: "EN_ATTENTE",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/archive`, {
        headers: { Cookie: cookie },
        data: { emplacement: "Rayon T3" },
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("exige un emplacement non vide", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutNumerisation: "TERMINE",
      statutIndexation: "TERMINE",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/archive`, {
        headers: { Cookie: cookie },
        data: { emplacement: "" },
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test("cycle complet validate → numerize → index → archive sur un même dossier", async ({ request }) => {
  const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
  try {
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    const r1 = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r1.status()).toBe(200);

    const r2 = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
      headers: { Cookie: operateurCookie },
      data: { nombrePages: 5 },
    });
    expect(r2.status()).toBe(200);

    const r3 = await request.post(`/api/dossiers/${dossier.id}/index`, { headers: { Cookie: operateurCookie } });
    expect(r3.status()).toBe(200);

    const r4 = await request.post(`/api/dossiers/${dossier.id}/archive`, {
      headers: { Cookie: operateurCookie },
      data: { emplacement: "Rayon test" },
    });
    expect(r4.status()).toBe(200);
    const final = await r4.json();
    expect(final.dossier.statutValidation).toBe("VALIDE");
    expect(final.dossier.statutNumerisation).toBe("TERMINE");
    expect(final.dossier.statutIndexation).toBe("TERMINE");
    expect(final.dossier.statutArchivage).toBe("TERMINE");
  } finally {
    await deleteTestDossier(dossier.id);
  }
});
