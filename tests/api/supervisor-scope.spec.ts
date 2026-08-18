import { test, expect } from "@playwright/test";
import { sessionCookieHeader, testPrisma, DEMO_USERS } from "../helpers/auth";
import { createTestDossier, deleteTestDossier } from "../helpers/db";

/**
 * Tests API (Phase 16+, § affectation opérateur -> superviseur) : un
 * SUPERVISEUR ne peut valider/rejeter/consulter que les dossiers des
 * opérateurs qui lui sont explicitement affectés (Operateur.supervisorId,
 * cf. access-scope.ts et assertSupervisorScope() dans workflow-service.ts).
 *
 * Le seed (prisma/seed.ts) affecte les 3 opérateurs démo au superviseur
 * démo — utilisé pour les cas "en périmètre". Pour les cas "hors
 * périmètre", chaque test crée une fiche opérateur jetable volontairement
 * SANS superviseur affecté (préfixe `TEST-ORPH-`), supprimée en fin de
 * test comme le reste des données de test API.
 */

async function createOrphanOperateur() {
  return testPrisma.operateur.create({
    data: {
      matricule: `TEST-ORPH-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      nom: "Opérateur non affecté (test)",
      isActive: true,
    },
  });
}

test.describe("Cloisonnement SUPERVISEUR par opérateur affecté", () => {
  test("un SUPERVISEUR valide un dossier d'un opérateur qui lui est affecté (200)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("un SUPERVISEUR ne peut pas valider un dossier d'un opérateur non affecté (403)", async ({ request }) => {
    const orphan = await createOrphanOperateur();
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE", operateurId: orphan.id });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
      await testPrisma.operateur.delete({ where: { id: orphan.id } }).catch(() => {});
    }
  });

  test("un SUPERVISEUR ne peut pas rejeter un dossier d'un opérateur non affecté (403)", async ({ request }) => {
    const orphan = await createOrphanOperateur();
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE", operateurId: orphan.id });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.post(`/api/dossiers/${dossier.id}/reject`, {
        headers: { Cookie: cookie },
        data: { commentaire: "Motif de test" },
      });
      expect(res.status()).toBe(403);
    } finally {
      await deleteTestDossier(dossier.id);
      await testPrisma.operateur.delete({ where: { id: orphan.id } }).catch(() => {});
    }
  });

  test("un ADMIN n'est pas soumis à cette restriction (200 même hors affectation)", async ({ request }) => {
    const orphan = await createOrphanOperateur();
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE", operateurId: orphan.id });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.admin);
      const res = await request.post(`/api/dossiers/${dossier.id}/validate`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(200);
    } finally {
      await deleteTestDossier(dossier.id);
      await testPrisma.operateur.delete({ where: { id: orphan.id } }).catch(() => {});
    }
  });

  test("la recherche /dossiers d'un SUPERVISEUR ne trouve pas un dossier d'un opérateur non affecté", async ({ request }) => {
    const orphan = await createOrphanOperateur();
    const dossier = await createTestDossier({ operateurId: orphan.id });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.get(`/dossiers?q=${encodeURIComponent(dossier.reference)}`, {
        headers: { Cookie: cookie },
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      // Pas de `.not.toContain(reference)` ici : le champ de recherche
      // réinjecte la valeur saisie dans son `value`, qu'il y ait un résultat
      // ou non (piège documenté dans TESTING.md) — le signal fiable est le
      // message d'état vide de DossiersTable.
      expect(html).toContain("Aucun dossier ne correspond à ces critères");
    } finally {
      await deleteTestDossier(dossier.id);
      await testPrisma.operateur.delete({ where: { id: orphan.id } }).catch(() => {});
    }
  });

  test("la fiche détail d'un dossier d'un opérateur non affecté renvoie 404 pour un SUPERVISEUR", async ({ request }) => {
    const orphan = await createOrphanOperateur();
    const dossier = await createTestDossier({ operateurId: orphan.id });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.superviseur);
      const res = await request.get(`/dossiers/${dossier.id}`, { headers: { Cookie: cookie } });
      expect(res.status()).toBe(404);
    } finally {
      await deleteTestDossier(dossier.id);
      await testPrisma.operateur.delete({ where: { id: orphan.id } }).catch(() => {});
    }
  });
});
