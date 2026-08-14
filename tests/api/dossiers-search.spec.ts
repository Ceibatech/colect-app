import { test, expect } from "@playwright/test";
import { sessionCookieHeader, testPrisma, DEMO_USERS } from "../helpers/auth";
import { createTestDossier, deleteTestDossier } from "../helpers/db";

/**
 * Tests API (Phase 13, §72) : recherche/filtres de /dossiers. Pas de route
 * /api/ dédiée (page Server Component) — on vérifie le HTML retourné
 * directement, comme pour pages-permissions.spec.ts.
 */
test.describe("Recherche et filtres /dossiers", () => {
  test("la recherche par référence trouve exactement le dossier créé", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.admin);
      const res = await request.get(`/dossiers?q=${encodeURIComponent(dossier.reference)}`, {
        headers: { Cookie: cookie },
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(dossier.reference);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("une recherche sans résultat n'affiche aucun des dossiers existants", async ({ request }) => {
    const cookie = await sessionCookieHeader(DEMO_USERS.admin);
    const res = await request.get(`/dossiers?q=REFERENCE-INTROUVABLE-ZZZ-999`, { headers: { Cookie: cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    // Note : le compteur "{n}<!-- -->dossier(s)" n'est pas cherchable tel
    // quel (React insère un commentaire de frontière d'hydratation entre le
    // nombre et le mot) — on vérifie plutôt le message d'état vide affiché
    // par DossiersTable.
    expect(html).toContain("Aucun dossier ne correspond à ces critères");
  });

  test("le filtre par statut de validation restreint les résultats", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "REJETE" });
    try {
      const cookie = await sessionCookieHeader(DEMO_USERS.admin);
      const res = await request.get(
        `/dossiers?q=${encodeURIComponent(dossier.reference)}&statutValidation=VALIDE`,
        { headers: { Cookie: cookie } }
      );
      const html = await res.text();
      // Le dossier est REJETE, filtré sur VALIDE -> aucun résultat. Note :
      // on ne peut pas se contenter de `not.toContain(dossier.reference)` —
      // la référence recherchée est de toute façon réinjectée telle quelle
      // dans l'attribut `value` du champ de recherche (comportement normal
      // d'un formulaire qui conserve la saisie), donc toujours présente
      // dans le HTML qu'il y ait un résultat ou non. Le signal fiable est
      // l'état vide du tableau de résultats.
      expect(html).toContain("Aucun dossier ne correspond à ces critères");
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });

  test("un OPERATEUR ne voit que ses propres dossiers (cloisonnement §6)", async ({ request }) => {
    const dossier = await createTestDossier({ statutValidation: "EN_CONTROLE" });
    try {
      // L'opérateur du dossier créé n'est pas nécessairement operateur1 —
      // le cloisonnement doit donc masquer ce dossier à operateur1 sauf
      // coïncidence. On vérifie l'absence pour un opérateur qui n'est pas
      // celui du dossier de test.
      const testDossierOperateur = await testPrisma.dossier.findUniqueOrThrow({
        where: { id: dossier.id },
        select: { operateur: { select: { userId: true } } },
      });
      const cookie = await sessionCookieHeader(DEMO_USERS.operateur1);
      const operateur1 = await testPrisma.user.findUniqueOrThrow({ where: { email: DEMO_USERS.operateur1 } });
      test.skip(
        testDossierOperateur.operateur?.userId === operateur1.id,
        "Coïncidence : le dossier de test appartient justement à operateur1, non pertinent pour ce test."
      );

      const res = await request.get(`/dossiers?q=${encodeURIComponent(dossier.reference)}`, { headers: { Cookie: cookie } });
      const html = await res.text();
      expect(html).not.toContain(dossier.reference);
    } finally {
      await deleteTestDossier(dossier.id);
    }
  });
});
