import { test, expect } from "@playwright/test";
import { sessionCookieHeader, DEMO_USERS, loadTestUser, testPrisma } from "../helpers/auth";
import { createTestDossier, deleteTestDossier } from "../helpers/db";

/**
 * Tests API (Phase 13, §72 ; étendus Phase 19+/20+) : transitions du
 * workflow contrôlé (§42) — validate/reject/prepare/numerize/index/archive.
 * Les contrôles conformes avancent automatiquement ; seules les anomalies
 * passent par le superviseur (À valider → Terminé/Rejeté). Depuis la Phase 20+, une nouvelle étape
 * "Préparation" s'intercale entre Validation et Numérisation : le cycle
 * complet est désormais Collecte → Validation → Préparation → Numérisation →
 * Indexation → Archivage. Chaque test crée son propre dossier jetable
 * (préfixe `TEST-API-`) dans l'état exact requis pour isoler la transition
 * testée, et le supprime en fin de test.
 */

async function validPreparationData(nombrePieces = 1, nombrePages = nombrePieces) {
  const typePiece = await testPrisma.typePiece.findFirstOrThrow({ where: { isActive: true } });
  return {
    pieceBreakdown: [{ typePiece: String(typePiece.id), nombrePieces, nombrePages }],
  };
}

async function createIndexedTestDocument(dossierId: number) {
  return testPrisma.document.create({
    data: {
      dossierId,
      nomFichier: `${dossierId}/test-indexe.pdf`,
      nomOriginal: "test-indexe.pdf",
      typeMime: "application/pdf",
      extension: "pdf",
      taille: 128,
      url: `/test/${dossierId}/test-indexe.pdf`,
      preIndexStatus: "PRET",
      automaticIndexStatus: "INDEXE",
      indexingConfidence: 98,
      indexedAt: new Date(),
    },
  });
}

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

test.describe("POST /api/dossiers/[id]/prepare (soumission opérateur, Phase 20+)", () => {
  test("valide automatiquement la préparation cohérente d'un dossier", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: await validPreparationData(5, 12),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutPreparation).toBe("TERMINE");
      expect(body.dossier.nombrePieces).toBe(5);
      expect(body.dossier.nombrePages).toBe(12);
      const lines = await testPrisma.preparationPieceLine.findMany({ where: { dossierId: dossier.id } });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ nombrePieces: 5, nombrePages: 12 });
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("permet à un agent de préparer un dossier inventorié par un autre opérateur", async ({ request }) => {
    const preparateurUser = await loadTestUser(DEMO_USERS.operateur1);
    const autreOperateur = await testPrisma.operateur.findFirstOrThrow({
      where: { userId: { not: preparateurUser.userId }, isActive: true },
    });
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      operateurId: autreOperateur.id,
    });

    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: {
          ...(await validPreparationData(3, 18)),
          observationsPreparation: "Ordre des pièces vérifié.",
        },
      });

      expect(res.status()).toBe(200);
      const prepared = await testPrisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } });
      expect(prepared.operateurId).toBe(autreOperateur.id);
      expect(prepared.preparateurId).toBe(preparateurUser.userId);
      expect(prepared.observationsPreparation).toBe("Ordre des pièces vérifié.");
      expect(prepared.dateSoumissionPreparation).not.toBeNull();
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de préparer un dossier non Validé (précondition)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: await validPreparationData(),
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de soumettre une préparation déjà À valider", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: await validPreparationData(),
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de préparer un dossier déjà Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "TERMINE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: await validPreparationData(),
      });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("autorise de relancer la préparation d'un dossier Rejeté", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "REJETE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
        headers: { Cookie: cookie },
        data: await validPreparationData(),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutPreparation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/prepare/claim", () => {
  test("réserve un dossier à un seul préparateur", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE" });
    try {
      const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const firstClaim = await request.post(`/api/dossiers/${dossier.id}/prepare/claim`, {
        headers: { Cookie: operateurCookie },
      });
      expect(firstClaim.status()).toBe(200);

      const claimed = await testPrisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } });
      expect(claimed.statutPreparation).toBe("EN_COURS");
      expect(claimed.preparateurId).not.toBeNull();
      expect(claimed.preparationClaimedAt).not.toBeNull();

      const adminCookie = await sessionCookieHeader(DEMO_USERS.admin);
      const conflictingClaim = await request.post(`/api/dossiers/${dossier.id}/prepare/claim`, {
        headers: { Cookie: adminCookie },
      });
      expect(conflictingClaim.status()).toBe(409);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/prepare/validate|reject (Phase 20+)", () => {
  test("SUPERVISEUR valide une préparation À valider — passe Terminé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutPreparation).toBe("TERMINE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("SUPERVISEUR rejette une préparation À valider avec un motif — renvoyée à l'opérateur", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Nombre de pièces incohérent." },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dossier.statutPreparation).toBe("REJETE");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse un OPERATEUR sans PREPARATION_VALIDATE (403)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "A_VALIDER" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de valider une préparation qui n'est pas À valider (précondition)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "EN_ATTENTE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/prepare/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});

test.describe("POST /api/dossiers/[id]/numerize (soumission opérateur, Phase 19+/20+)", () => {
  test("oriente vers le superviseur une numérisation sans fichier", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "TERMINE" });
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

  test("valide automatiquement la numérisation dès qu'un fichier existe", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "TERMINE" });
    try {
      await createIndexedTestDocument(dossier.id);
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

  test("refuse de numériser un dossier dont la Préparation n'est pas Terminée (précondition, Phase 20+)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "VALIDE", statutPreparation: "EN_ATTENTE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de soumettre une numérisation déjà À valider", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "A_VALIDER",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de numériser un dossier déjà Terminé", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "TERMINE",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(400);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("autorise de relancer la numérisation d'un dossier Rejeté", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "REJETE",
    });
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "A_VALIDER",
    });
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "A_VALIDER",
    });
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "A_VALIDER",
    });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const res = await request.post(`/api/dossiers/${dossier.id}/numerize/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("refuse de valider une numérisation qui n'est pas À valider (précondition)", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "EN_ATTENTE",
    });
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
  test("valide automatiquement l'indexation lorsque tous les fichiers sont conformes", async ({ request }) => {
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "TERMINE",
    });
    try {
      await createIndexedTestDocument(dossier.id);
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "EN_ATTENTE",
    });
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "TERMINE",
      statutIndexation: "A_VALIDER",
    });
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
    const dossier = await createTestDossier({
      statutValidation: "VALIDE",
      statutPreparation: "TERMINE",
      statutNumerisation: "TERMINE",
      statutIndexation: "A_VALIDER",
    });
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
      statutPreparation: "TERMINE",
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
      statutPreparation: "TERMINE",
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
      statutPreparation: "TERMINE",
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
      statutPreparation: "TERMINE",
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
      statutPreparation: "TERMINE",
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

test("cycle continu : les étapes conformes avancent sans validation humaine systématique", async ({ request }) => {
  const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
  try {
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    const r1 = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: superviseurCookie } });
    expect(r1.status()).toBe(200);

    // Préparation cohérente : validation automatique.
    const r1p = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
      headers: { Cookie: operateurCookie },
      data: await validPreparationData(4, 5),
    });
    expect(r1p.status()).toBe(200);
    expect((await r1p.json()).dossier.statutPreparation).toBe("TERMINE");

    await createIndexedTestDocument(dossier.id);

    // Le fichier disponible valide la numérisation et l'indexation.
    const r2 = await request.post(`/api/dossiers/${dossier.id}/numerize`, {
      headers: { Cookie: operateurCookie },
      data: { nombrePages: 5 },
    });
    expect(r2.status()).toBe(200);
    expect((await r2.json()).dossier.statutNumerisation).toBe("TERMINE");
    const automaticallyIndexed = await testPrisma.dossier.findUniqueOrThrow({ where: { id: dossier.id } });
    expect(automaticallyIndexed.statutIndexation).toBe("TERMINE");

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
    expect(final.dossier.statutPreparation).toBe("TERMINE");
    expect(final.dossier.statutNumerisation).toBe("TERMINE");
    expect(final.dossier.statutIndexation).toBe("TERMINE");
    expect(final.dossier.statutArchivage).toBe("TERMINE");
  } finally {
    await deleteTestDossier(dossier.id);
  }
});

test("un rejet d'exception peut être corrigé puis validé automatiquement", async ({ request }) => {
  const dossier = await createTestDossier({ statutValidation: "VALIDE" });
  try {
    const superviseurCookie = await sessionCookieHeader(DEMO_USERS.superviseur);
    const operateurCookie = await sessionCookieHeader(DEMO_USERS.operateur1);

    await testPrisma.dossier.update({ where: { id: dossier.id }, data: { statutPreparation: "A_VALIDER" } });

    const r2 = await request.post(`/api/dossiers/${dossier.id}/prepare/reject`, {
      headers: { Cookie: superviseurCookie },
      data: { commentaire: "À refaire." },
    });
    expect((await r2.json()).dossier.statutPreparation).toBe("REJETE");

    // L'opérateur relance — nouvelle soumission autorisée depuis Rejeté.
    const r3 = await request.post(`/api/dossiers/${dossier.id}/prepare`, {
      headers: { Cookie: operateurCookie },
      data: await validPreparationData(),
    });
    expect(r3.status()).toBe(200);
    expect((await r3.json()).dossier.statutPreparation).toBe("TERMINE");
  } finally {
    await deleteTestDossier(dossier.id);
  }
});
