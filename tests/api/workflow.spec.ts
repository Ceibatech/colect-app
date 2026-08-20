import { test, expect } from "@playwright/test";
import { sessionCookieHeader, DEMO_USERS } from "../helpers/auth";
import { createTestDossier, deleteTestDossier } from "../helpers/db";

/**
 * Tests API (Phase 13, §72 ; étendus Phase 19+) : transitions du workflow
 * contrôlé (§42) — validate/reject/numerize/index/archive, et depuis la
 * Phase 19+ la validation superviseur systématique à chaque étape
 * opérationnelle (numerize/index/archive → À valider → Terminé, ou →
 * Rejeté → relance par l'opérateur). Chaque test crée son propre dossier
 * jetable (préfixe `TEST-API-`) dans l'état exact requis pour isoler la
 * transition testée, et le supprime en fin de test.
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

test.describe("POST /api/dossiers/[id]/numerize (soumission opérateur, Phase 19+)", () => {
  test("soumet la numérisation d'un dossier Validé — passe À valider, pas Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
        headers: { Cookie: cookie },
        data: { nombrePages: 12 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutNumerisation).toBe("A_VALIDER");
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

  test("refuse de soumettre une numérisation déjà À valider", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de numériser un dossier déjà Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("autorise de relancer la numérisation d'un dossier Rejeté", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "REJETE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutNumerisation).toBe("A_VALIDER");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/numerize/validate|reject (Phase 19+)", () => {
  test("SUPERVISEUR valide une numérisation À valider — passe Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutNumerisation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("SUPERVISEUR rejette une numérisation À valider avec un motif — renvoyée à l'opérateur", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Scan illisible — à refaire." },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutNumerisation).toBe("REJETE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse un OPERATEUR sans NUMERISATION_VALIDATE (403)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de valider une numérisation qui n'est pas À valider (précondition)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "EN_ATTENTE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/index (soumission opérateur, Phase 19+)", () => {
  test("soumet l'indexation d'un dossier Numérisé — passe À valider, pas Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/index`, {
        headers: { Cookie: cookie },
        data: { scoreQualite: 88 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutIndexation).toBe("A_VALIDER");
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

test.describe("POST /api/dossiers/[id]/index/validate|reject (Phase 19+)", () => {
  test("SUPERVISEUR valide une indexation À valider — passe Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE", statutIndexation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/index/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutIndexation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("SUPERVISEUR rejette une indexation À valider avec un motif", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutNumerisation: "TERMINE", statutIndexation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/index/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Métadonnées incorrectes." },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutIndexation).toBe("REJETE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/archive (soumission opérateur, Phase 19+)", () => {
  test("soumet l'archivage d'un dossier Indexé avec un emplacement — passe À valider, pas Terminé", async ({ request }) => {
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
      expect(body.dossier.statutArchivage).toBe("A_VALIDER");
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

test.describe("POST /api/dossiers/[id]/archive/validate|reject (Phase 19+)", () => {
  test("SUPERVISEUR valide un archivage À valider — passe Terminé (dernière étape)", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutNumerisation: "TERMINE",
      statutIndexation: "TERMINE",
      statutArchivage: "A_VALIDER",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/archive/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutArchivage).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("SUPERVISEUR rejette un archivage À valider avec un motif", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutNumerisation: "TERMINE",
      statutIndexation: "TERMINE",
      statutArchivage: "A_VALIDER",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/archive/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Emplacement déjà occupé." },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutArchivage).toBe("REJETE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test("cycle complet : Collecte validée → chaque étape opérationnelle soumise puis validée par le superviseur", async ({ request }) => {
  const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
  try {
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    const r1 = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r1.status()).toBe(200);

    // Numérisation : soumission opérateur (-> À valider) puis validation superviseur (-> Terminé).
    const r2 = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
      headers: { Cookie: operateurCookie },
      data: { nombrePages: 5 },
    });
    expect(r2.status()).toBe(200);
    expect((await r2.json()).dossier.statutNumerisation).toBe("A_VALIDER");
    const r2v = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r2v.status()).toBe(200);
    expect((await r2v.json()).dossier.statutNumerisation).toBe("TERMINE");

    // Indexation : même principe.
    const r3 = await request.post(`/api/dossiers/${dossier.id}/index`, { headers: { Cookie: operateurCookie } });
    expect(r3.status()).toBe(200);
    expect((await r3.json()).dossier.statutIndexation).toBe("A_VALIDER");
    const r3v = await request.post(`/api/dossiers/${dossier.id}/index/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r3v.status()).toBe(200);
    expect((await r3v.json()).dossier.statutIndexation).toBe("TERMINE");

    // Archivage : même principe, dernière étape.
    const r4 = await request.post(`/api/dossiers/${dossier.id}/archive`, {
      headers: { Cookie: operateurCookie },
      data: { emplacement: "Rayon test" },
    });
    expect(r4.status()).toBe(200);
    expect((await r4.json()).dossier.statutArchivage).toBe("A_VALIDER");
    const r4v = await request.post(`/api/dossiers/${dossier.id}/archive/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r4v.status()).toBe(200);

    const final = await r4v.json();
    expect(final.dossier.statutValidation).toBe("VALIDE");
    expect(final.dossier.statutNumerisation).toBe("TERMINE");
    expect(final.dossier.statutIndexation).toBe("TERMINE");
    expect(final.dossier.statutArchivage).toBe("TERMINE");
  } finally {
    await deleteTestDossier(dossier.id);
  }
});

test("un rejet renvoie l'étape à l'opérateur, qui peut la relancer jusqu'à validation", async ({ request }) => {
  const dossier = await createTestDossier({ statutValidation: "VALIDE" });
  try {
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    const r1 = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: operateurCookie } });
    expect((await r1.json()).dossier.statutNumerisation).toBe("A_VALIDER");

    const r2 = await request.post(`/api/dossiers/${dossier.id}/numerize/reject`, {
      headers: { Cookie: superviseurCookie },
      data: { commentaire: "À refaire." },
    });
    expect((await r2.json()).dossier.statutNumerisation).toBe("REJETE");

    // L'opérateur relance — nouvelle soumission autorisée depuis Rejeté.
    const r3 = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: operateurCookie } });
    expect(r3.status()).toBe(200);
    expect((await r3.json()).dossier.statutNumerisation).toBe("A_VALIDER");

    const r4 = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r4.status()).toBe(200);
    expect((await r4.json()).dossier.statutNumerisation).toBe("TERMINE");
  } finally {
    await deleteTestDossier(dossier.id);
  }
});
